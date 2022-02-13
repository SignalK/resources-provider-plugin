import {
  Plugin,
  PluginServerApp
  // ResourceType, ResourceProvider
} from '@signalk/server-api'
// ***********************************************
import { FileStore } from './lib/filestorage'
import { Utils } from './lib/utils'
import { StoreRequestParams } from './types'

// ******  duplicate of '@signalk/server-api' until new version published ****
type SignalKResourceType =
  | 'routes'
  | 'waypoints'
  | 'notes'
  | 'regions'
  | 'charts'

export type ResourceType = SignalKResourceType | string

export interface ResourceProvider {
  type: ResourceType
  methods: ResourceProviderMethods
}

export interface ResourceProviderMethods {
  listResources: (query: { [key: string]: any }) => Promise<any>
  getResource: (id: string) => Promise<any>
  setResource: (id: string, value: { [key: string]: any }) => Promise<any>
  deleteResource: (id: string) => Promise<any>
}

interface ResourceProviderApp extends PluginServerApp {
  statusMessage?: () => string
  error: (msg: string) => void
  debug: (msg: string) => void
  setPluginStatus: (pluginId: string, status?: string) => void
  setPluginError: (pluginId: string, status?: string) => void
  setProviderStatus: (providerId: string, status?: string) => void
  setProviderError: (providerId: string, status?: string) => void
  getSelfPath: (path: string) => void
  savePluginOptions: (options: any, callback: () => void) => void
  config: { configPath: string }
  registerResourceProvider: (resourceProvider: ResourceProvider) => void
}

const CONFIG_SCHEMA = {
  properties: {
    standard: {
      type: 'object',
      title: 'Resources (standard)',
      description:
        'ENABLE / DISABLE storage provider for the following SignalK resource types.',
      properties: {
        routes: {
          type: 'boolean',
          title: 'ROUTES'
        },
        waypoints: {
          type: 'boolean',
          title: 'WAYPOINTS'
        },
        notes: {
          type: 'boolean',
          title: 'NOTES'
        },
        regions: {
          type: 'boolean',
          title: 'REGIONS'
        }
      }
    },
    custom: {
      type: 'array',
      title: 'Resources (custom)',
      description: 'Define paths for custom resource types.',
      items: {
        type: 'object',
        required: ['name'],
        properties: {
          name: {
            type: 'string',
            title: 'Name',
            description: 'Path name to use /signalk/v1/api/resources/<name>'
          }
        }
      }
    },
    path: {
      type: 'string',
      title:
        'Path to Resource data: URL or file system path (relative to home/<user>/.signalk)',
      default: './resources'
    }
  }
}

const CONFIG_UISCHEMA = {
  standard: {
    routes: {
      'ui:widget': 'checkbox',
      'ui:title': ' ',
      'ui:help': 'Signal K Route resources'
    },
    waypoints: {
      'ui:widget': 'checkbox',
      'ui:title': ' ',
      'ui:help': 'Signal K Waypoint resources'
    },
    notes: {
      'ui:widget': 'checkbox',
      'ui:title': ' ',
      'ui:help': 'Signal K Note resources'
    },
    regions: {
      'ui:widget': 'checkbox',
      'ui:title': ' ',
      'ui:help': 'Signal K Region resources'
    }
  },
  path: {
    'ui:emptyValue': './resources',
    'ui:help': 'Enter URL or path relative to home/<user>/.signalk/'
  }
}

module.exports = (server: ResourceProviderApp): Plugin => {
  let subscriptions: any[] = [] // stream subscriptions
  const utils: Utils = new Utils()

  const plugin: Plugin = {
    id: 'resources-provider',
    name: 'Resources Provider',
    schema: () => CONFIG_SCHEMA,
    uiSchema: () => CONFIG_UISCHEMA,
    start: (options: any, restart: any) => {
      doStartup(options)
    },
    stop: () => {
      doShutdown()
    }
  }

  const db: FileStore = new FileStore(plugin.id)

  let config: any = {
    standard: {
      routes: true,
      waypoints: true,
      notes: true,
      regions: true
    },
    custom: [],
    path: './resources'
  }

  const doStartup = (options: any) => {
    try {
      server.debug(`${plugin.name} starting.......`)
      if (options && options.standard) {
        config = options
      } else {
        // save defaults if no options loaded
        server.savePluginOptions(config, () => {
          server.debug(`Default configuration applied...`)
        })
      }
      server.debug(`Applied config: ${JSON.stringify(config)}`)

      // compile list of enabled resource types
      let apiProviderFor: string[] = []
      Object.entries(config.standard).forEach((i) => {
        if (i[1]) {
          apiProviderFor.push(i[0])
        }
      })

      if (config.custom && Array.isArray(config.custom)) {
        const customTypes = config.custom.map((i: any) => {
          return i.name
        })
        apiProviderFor = apiProviderFor.concat(customTypes)
      }

      server.debug(
        `** Enabled resource types: ${JSON.stringify(apiProviderFor)}`
      )

      // ** initialise resource storage
      db.init({ settings: config, path: server.config.configPath })
        .then((res: { error: boolean; message: string }) => {
          if (res.error) {
            const msg = `*** ERROR: ${res.message} ***`
            server.error(msg)
            server.setPluginError(msg)
          }

          server.debug(
            `** ${plugin.name} started... ${!res.error ? 'OK' : 'with errors!'}`
          )

          // register as provider for enabled resource types
          const result = registerProviders(apiProviderFor)

          const msg =
            result.length !== 0
              ? `${result.toString()} not registered!`
              : `Providing: ${apiProviderFor.toString()}`

          if (typeof server.setPluginStatus === 'function') {
            server.setPluginStatus(msg)
          } else {
            server.setProviderStatus(msg)
          }
        })
        .catch((e: Error) => {
          server.debug(e.message)
          const msg = `Initialisation Error! See console for details.`
          server.setPluginError(msg)
        })
    } catch (error) {
      const msg = `Started with errors!`
      server.setPluginError(msg)
      server.error('error: ' + error)
    }
  }

  const doShutdown = () => {
    server.debug(`${plugin.name} stopping.......`)
    server.debug('** Un-registering Update Handler(s) **')
    subscriptions.forEach((b) => b())
    subscriptions = []
    const msg = 'Stopped.'
    if (typeof server.setPluginStatus === 'function') {
      server.setPluginStatus(msg)
    } else {
      server.setProviderStatus(msg)
    }
  }

  const getVesselPosition = () => {
    const p: any = server.getSelfPath('navigation.position')
    return p && p.value ? [p.value.longitude, p.value.latitude] : null
  }

  const registerProviders = (resTypes: string[]): string[] => {
    const failed: string[] = []
    resTypes.forEach((resType) => {
      try {
        server.registerResourceProvider({
          type: resType,
          methods: {
            listResources: (params: object): any => {
              return apiGetResource(resType, '', params)
            },
            getResource: (id: string) => {
              return apiGetResource(resType, id)
            },
            setResource: (id: string, value: any) => {
              return apiSetResource(resType, id, value)
            },
            deleteResource: (id: string) => {
              return apiSetResource(resType, id, null)
            }
          }
        })
      } catch (error) {
        failed.push(resType)
      }
    })
    return failed
  }

  // ******* Signal K server Resource Provider interface functions **************

  const apiGetResource = async (
    resType: string,
    id: string,
    params?: any
  ): Promise<{ [key: string]: any }> => {
    // append vessel position to params
    params = params ?? {}
    params.position = getVesselPosition()
    server.debug(
      `*** apiGetResource:  ${resType}, ${id}, ${JSON.stringify(params)}`
    )
    try {
      if (!id) {
        // retrieve resource list
        return await db.getResources(resType, null, params)
      } else {
        // retrieve resource entry
        return await db.getResources(resType, id)
      }
    } catch (error) {
      throw error
    }
  }

  const apiSetResource = async (
    resType: string,
    id: string,
    value: any
  ): Promise<void> => {
    server.debug(`*** apiSetResource:  ${resType}, ${id}, ${value}`)
    const r: StoreRequestParams = {
      type: resType,
      id,
      value
    }
    try {
      await db.setResource(r)
      return
    } catch (error) {
      throw error
    }
  }

  return plugin
}
