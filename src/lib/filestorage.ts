import { constants } from 'fs'
import {
  access,
  mkdir,
  readdir,
  readFile,
  stat,
  unlink,
  writeFile
} from 'fs/promises'
import path from 'path'
import { IResourceStore, StoreRequestParams } from '../types'
import { Utils } from './utils'

// ** File Resource Store Class
export class FileStore implements IResourceStore {
  utils: Utils
  savePath: string
  resources: any
  pkg: { id: string }

  constructor(pluginId = '') {
    this.utils = new Utils()
    this.savePath = ''
    this.resources = {}
    this.pkg = { id: pluginId }
  }

  // ** check / create path to persist resources
  async init(config: any): Promise<{ error: boolean; message: string }> {
    if (typeof config.settings.path === 'undefined') {
      this.savePath = config.path + '/resources'
    } else if (config.settings.path[0] == '/') {
      this.savePath = config.settings.path
    } else {
      this.savePath = path.join(config.path, config.settings.path)
    }
    // std resources
    if (config.settings.standard) {
      Object.keys(config.settings.standard).forEach((i: any) => {
        this.resources[i] = { path: path.join(this.savePath, `/${i}`) }
      })
    }
    // other resources
    const enabledResTypes: any = {}
    Object.assign(enabledResTypes, config.settings.standard)
    if (config.settings.custom && Array.isArray(config.settings.custom)) {
      config.settings.custom.forEach((i: any) => {
        this.resources[i.name] = {
          path: path.join(this.savePath, `/${i.name}`)
        }
        enabledResTypes[i.name] = true
      })
    }

    try {
      await this.checkPath(this.savePath)
    } catch (error) {
      throw new Error(`Unable to create ${this.savePath}!`)
    }
    return await this.createSavePaths(enabledResTypes)
  }

  // ** create save paths for resource types
  async createSavePaths(
    resTypes: any
  ): Promise<{ error: boolean; message: string }> {
    console.log('** Initialising resource storage **')
    const result = { error: false, message: `` }
    Object.keys(this.resources).forEach(async (t: string) => {
      if (resTypes[t]) {
        try {
          await access(this.resources[t].path, constants.W_OK | constants.R_OK)
          console.log(`${this.resources[t].path} - OK....`)
        } catch (error) {
          console.log(`${this.resources[t].path} NOT available...`)
          console.log(`Creating ${this.resources[t].path} ...`)
          try {
            await mkdir(this.resources[t].path, { recursive: true })
            console.log(`Created ${this.resources[t].path} - OK....`)
          } catch (error) {
            result.error = true
            result.message += `ERROR creating ${this.resources[t].path} folder\r\n `
          }
        }
      }
    })
    return result
  }

  // ** return persisted resources from storage
  async getResources(
    type: string,
    item: any = null,
    params: any = {}
  ): Promise<{ [key: string]: any }> {
    let result: any = {}
    // ** parse supplied params
    params = this.utils.processParameters(params)
    if (params.error) {
      throw new Error(params.error)
    }
    try {
      if (item) {
        // return specified resource
        item = item.split(':').slice(-1)[0]
        result = JSON.parse(
          await readFile(path.join(this.resources[type].path, item), 'utf8')
        )
        const stats: any = stat(path.join(this.resources[type].path, item))
        result.timestamp = stats.mtime
        result.$source = this.pkg.id
        return result
      } else {
        // return matching resources
        const rt = this.resources[type]
        const files = await readdir(rt.path)
        // check resource count
        const fcount =
          params.limit && files.length > params.limit
            ? params.limit
            : files.length
        for (const f in files) {
          if (f >= fcount) {
            break
          }
          const uuid = this.utils.uuidPrefix + files[f]
          try {
            const res = JSON.parse(
              await readFile(path.join(rt.path, files[f]), 'utf8')
            )
            // ** apply param filters **
            if (this.utils.passFilter(res, type, params)) {
              result[uuid] = res
              const stats: any = stat(path.join(rt.path, files[f]))
              result[uuid].timestamp = stats.mtime
              result[uuid].$source = this.pkg.id
            }
          } catch (err) {
            console.error(err)
            throw new Error(`Invalid file contents: ${files[f]}`)
          }
        }
        return result
      }
    } catch (error) {
      console.error(error)
      throw new Error(
        `Error retreiving resources from ${this.savePath}. Ensure plugin is active or restart plugin!`
      )
    }
  }

  // ** save / delete (r.value==null) resource file
  async setResource(r: StoreRequestParams): Promise<void> {
    const fname = r.id.split(':').slice(-1)[0]
    const p = path.join(this.resources[r.type].path, fname)

    if (r.value === null) {
      // ** delete file **
      try {
        await unlink(p)
        console.log(`** DELETED: ${r.type} entry ${fname} **`)
        return
      } catch (error) {
        console.error('Error deleting resource!')
        ;(error as Error).message = 'Error deleting resource!'
        throw error
      }
    } else {
      // ** add / update file
      try {
        await writeFile(p, JSON.stringify(r.value))
        console.log(`** ${r.type} written to ${fname} **`)
        return
      } catch (error) {
        console.error('Error updating resource!')
        throw error
      }
    }
  }

  // ** check path exists / create it if it doesn't **
  async checkPath(path: string = this.savePath): Promise<boolean | Error> {
    if (!path) {
      throw new Error(`Path not supplied!`)
    }
    try {
      await access(
        // check path exists
        path,
        constants.W_OK | constants.R_OK
      )
      console.log(`${path} - OK...`)
      return true
    } catch (error) {
      // if not then create it
      console.log(`${path} does NOT exist...`)
      console.log(`Creating ${path} ...`)
      try {
        await mkdir(path, { recursive: true })
        console.log(`Created ${path} - OK...`)
        return true
      } catch (error) {
        throw new Error(`Unable to create ${path}!`)
      }
    }
  }
}
