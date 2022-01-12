import {
  Plugin,
  PluginServerApp
  // ResourceTypes, ResourceProvider, ResourcesApi
} from "@signalk/server-api";

// ******  duplicate of '@signalk/server-api' until new version published ****
type SignalKResourceType =
  | "routes"
  | "waypoints"
  | "notes"
  | "regions"
  | "charts";
export type ResourceTypes = SignalKResourceType[] | string[];

export interface ResourceProviderMethods {
  pluginId?: string;
  listResources: (type: string, query: { [key: string]: any }) => Promise<any>;
  getResource: (type: string, id: string) => Promise<any>;
  setResource: (
    type: string,
    id: string,
    value: { [key: string]: any }
  ) => Promise<any>;
  deleteResource: (type: string, id: string) => Promise<any>;
}

export interface ResourceProvider {
  types: ResourceTypes;
  methods: ResourceProviderMethods;
}

export interface ResourcesApi {
  register: (pluginId: string, provider: ResourceProvider) => void;
  unRegister: (pluginId: string) => void;
  getResource: (resType: SignalKResourceType, resId: string) => any;
}

// ***********************************************

import { FileStore } from "./lib/filestorage";
import { Utils } from "./lib/utils";
import { StoreRequestParams } from "./types";

interface ResourceProviderPlugin extends Plugin {
  resourceProvider: ResourceProvider;
}

interface ResourceProviderApp extends PluginServerApp {
  statusMessage?: () => string;
  error: (msg: string) => void;
  debug: (msg: string) => void;
  setPluginStatus: (pluginId: string, status?: string) => void;
  setPluginError: (pluginId: string, status?: string) => void;
  setProviderStatus: (providerId: string, status?: string) => void;
  setProviderError: (providerId: string, status?: string) => void;
  getSelfPath: (path: string) => void;
  config: { configPath: string };
  resourcesApi: ResourcesApi;
}

const CONFIG_SCHEMA = {
  properties: {
    API: {
      type: "object",
      title: "Resources (standard)",
      description:
        "ENABLE / DISABLE storage provider for the following SignalK resource types.",
      properties: {
        routes: {
          type: "boolean",
          title: "ROUTES"
        },
        waypoints: {
          type: "boolean",
          title: "WAYPOINTS"
        },
        notes: {
          type: "boolean",
          title: "NOTES"
        },
        regions: {
          type: "boolean",
          title: "REGIONS"
        }
      }
    },
    resourcesOther: {
      type: "array",
      title: "Resources (custom)",
      description: "Define paths for custom resource types.",
      items: {
        type: "object",
        required: ["name"],
        properties: {
          name: {
            type: "string",
            title: "Name",
            description: "Path name to use /signalk/v1/api/resources/<name>"
          }
        }
      }
    },
    path: {
      type: "string",
      title:
        "PATH to Resource data: URL or file system path (relative to home/<user>/.signalk)",
      default: "./resources"
    }
  }
};

const CONFIG_UISCHEMA = {
  API: {
    routes: {
      "ui:widget": "checkbox",
      "ui:title": " ",
      "ui:help": "Signal K Route resources"
    },
    waypoints: {
      "ui:widget": "checkbox",
      "ui:title": " ",
      "ui:help": "Signal K Waypoint resources"
    },
    notes: {
      "ui:widget": "checkbox",
      "ui:title": " ",
      "ui:help": "Signal K Note resources"
    },
    regions: {
      "ui:widget": "checkbox",
      "ui:title": " ",
      "ui:help": "Signal K Region resources"
    }
  },
  PATH: {
    "ui:emptyValue": "./resources",
    "ui:help": "Enter URL or path relative to home/<user>/.signalk/"
  }
};

module.exports = (server: ResourceProviderApp): ResourceProviderPlugin => {
  let subscriptions: any[] = []; // stream subscriptions
  const utils: Utils = new Utils();

  const plugin: ResourceProviderPlugin = {
    id: "resources-provider",
    name: "Resources Provider (default)",
    schema: () => CONFIG_SCHEMA,
    uiSchema: () => CONFIG_UISCHEMA,
    start: (options: any, restart: any) => {
      doStartup(options);
    },
    stop: () => {
      doShutdown();
    },
    resourceProvider: {
      types: [],
      methods: {
        listResources: (type: string, params: object): any => {
          return apiGetResource(type, "", params);
        },
        getResource: (type: string, id: string) => {
          return apiGetResource(type, id);
        },
        setResource: (type: string, id: string, value: any) => {
          return apiSetResource(type, id, value);
        },
        deleteResource: (type: string, id: string) => {
          return apiSetResource(type, id, null);
        }
      }
    }
  };

  const db: FileStore = new FileStore(plugin.id);

  let config: any = {
    API: {
      routes: false,
      waypoints: false,
      notes: false,
      regions: false
    }
  };

  let apiProviderFor: string[];
  let customTypes: string[];

  const doStartup = (options: any) => {
    try {
      server.debug(`${plugin.name} starting.......`);

      config = options || config;
      server.debug("*** Configuration ***");
      server.debug(JSON.stringify(config));

      // compile list of enabled resource types
      apiProviderFor = [];
      for (const i in config.API) {
        if (config.API[i]) {
          apiProviderFor.push(i as string);
        }
      }
      customTypes = [];
      if (config.resourcesOther && Array.isArray(config.resourcesOther)) {
        customTypes = config.resourcesOther.map((i: any) => {
          return i.name;
        });
      }
      plugin.resourceProvider.types = apiProviderFor.concat(customTypes);

      server.debug("*** Enabled standard resources ***");
      server.debug(JSON.stringify(apiProviderFor));
      server.debug("*** Enabled additional resources ***");
      server.debug(JSON.stringify(customTypes));

      // ** initialise resource storage
      db.init({ settings: config, path: server.config.configPath })
        .then((res: { error: boolean; message: string }) => {
          if (res.error) {
            const msg = `*** ERROR: ${res.message} ***`;
            server.error(msg);
            server.setPluginError(msg);
          }

          server.debug(
            `** ${plugin.name} started... ${!res.error ? "OK" : "with errors!"}`
          );
          const msg = `Resource Provider (active): ${plugin.resourceProvider.types.toString()}`;
          if (typeof server.setPluginStatus === "function") {
            server.setPluginStatus(msg);
          } else {
            server.setProviderStatus(msg);
          }
        })
        .catch((e: Error) => {
          server.debug(e.message);
          const msg = `Initialisation Error! See console for details.`;
          server.setPluginError(msg);
        });

      // ** register resource provider **
      server.resourcesApi.register(plugin.id, plugin.resourceProvider);
    } catch (error) {
      const msg = `Started with errors!`;
      server.setPluginError(msg);
      server.error("error: " + error);
    }
  };

  const doShutdown = () => {
    server.debug(`${plugin.name} stopping.......`);
    server.debug("** Un-registering Resource Provider(s) **");
    server.resourcesApi.unRegister(plugin.id);
    server.debug("** Un-registering Update Handler(s) **");
    subscriptions.forEach(b => b());
    subscriptions = [];
    const msg = "Stopped.";
    if (typeof server.setPluginStatus === "function") {
      server.setPluginStatus(msg);
    } else {
      server.setProviderStatus(msg);
    }
  };

  const getVesselPosition = () => {
    const p: any = server.getSelfPath("navigation.position");
    return p && p.value ? [p.value.longitude, p.value.latitude] : null;
  };

  // ******* Signal K server Resource Provider interface functions **************

  const apiGetResource = async (
    resType: string,
    id: string,
    params?: any
  ): Promise<any> => {
    // append vessel position to params
    params = params ?? {};
    params.position = getVesselPosition();
    server.debug(
      `*** apiGetResource:  ${resType}, ${id}, ${JSON.stringify(params)}`
    );
    try {
      if (!id) {
        // retrieve resource list
        return await db.getResources(resType, null, params);
      } else {
        // retrieve resource entry
        return await db.getResources(resType, id);
      }
    } catch (error) {
      throw error;
    }
  };

  const apiSetResource = async (
    resType: string,
    id: string,
    value: any
  ): Promise<boolean | Error> => {
    server.debug(`*** apiSetResource:  ${resType}, ${id}, ${value}`);
    const r: StoreRequestParams = {
      type: resType,
      id,
      value
    };
    try {
      return await db.setResource(r);
    } catch (error) {
      throw error;
    }
  };

  return plugin;
};
