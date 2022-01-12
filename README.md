# Signal K Resources Provider Plugin:

__Signal K server plugin that implements the Resource Provider API__.

_Note: This plugin should ONLY be installed on Signal K server version 1.41.0 or later that implements the `Resources API`!_

---

This plugin is a resource provider, facilitating the storage and retrieval of the following resource types defined by the Signal K specification:
- `resources/routes`
- `resources/waypoints`
- `resources/notes`
- `resources/regions`   

as well as custom resource types provisioned as additional paths under `/signalk/v1/api/resources`.

- _example:_ `resources/fishingZones`   

Each path is provisioned with `GET`, `PUT`, `POST` and `DELETE` operations enabled.

Operation of all paths is as set out in the Signal K specification.


---
## Installation and Configuration:

1. Install the plugin from the Signal K server __AppStore__

1. Re-start the Signal K server to make the plugin configuration available 

1. In the __Server -> Plugin Config__ set the plugin to __Active__

1. Select which resource paths you want the plugin to handle: `Routes, Waypoints, Notes, Regions`.

1. Specify any additional resource paths you require.

1. Select the type of resource data store you want to use. _(See note below)_

1. Enter the file system path you want to host the resources. _(Note: this path will be created if it does not already exist.)_

1. Click __Submit__ 

---

## Data Storage:

This plugin is designed to host / persist resource data in the servers filesystem.

Currently the following data store types are provided:

A file for each resource is created within a folder for that resource type on your device's file system. The folder will be contained within the path entered in the configuration. 

    _For example:_

    Routes will be stored in `<config_path>/routes`

    Notes will be stored in `<config_path>/notes`


---
## Use and Operation:

Once configured the plugin registers itself as the resource provider for each of the resource types enabled in the `Plugin Confg` screen.

The SignalK server will pass all requests _(HTTP GET, POST, PUT and DELETE)_for theses resource types to the plugin.

_Please refer to the [Signal K specification](https://signalk.org/specification) and  [Signal K Server documentation](https://signalk.org/signalk-server/RESOURCE_PROVIDER_PLUGINS.md) for details about working with resources._
