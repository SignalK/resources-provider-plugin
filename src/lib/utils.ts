// ** utility library functions **

import {
  computeDestinationPoint,
  getCenterOfBounds,
  isPointInPolygon
} from 'geolib'
import ngeohash from 'ngeohash'

export class Utils {
  uuidPrefix = 'urn:mrn:signalk:uuid:'

  // ** check geometry is in bounds
  inBounds(val: any, type: string, polygon: number[]): boolean {
    let ok = false
    switch (type) {
      case 'notes':
      case 'waypoints':
        if (val.position) {
          ok = isPointInPolygon(val.position, polygon)
        }
        if (val.geohash) {
          const bar = ngeohash.decode_bbox(val.geohash)
          const bounds = this.toPolygon(
            `${bar[1]},${bar[0]}, ${bar[3]}, ${bar[2]}`
          )
          const center = getCenterOfBounds(bounds)
          ok = isPointInPolygon(center, polygon)
        }
        break
      case 'routes':
        if (val.feature.geometry.coordinates) {
          val.feature.geometry.coordinates.forEach((pt: any) => {
            ok = ok || isPointInPolygon(pt, polygon)
          })
        }
        break
      case 'regions':
        if (
          val.feature.geometry.coordinates &&
          val.feature.geometry.coordinates.length > 0
        ) {
          if (val.feature.geometry.type == 'Polygon') {
            val.feature.geometry.coordinates.forEach((ls: any) => {
              ls.forEach((pt: any) => {
                ok = ok || isPointInPolygon(pt, polygon)
              })
            })
          } else if (val.feature.geometry.type == 'MultiPolygon') {
            val.feature.geometry.coordinates.forEach((polygon: any) => {
              polygon.forEach((ls: any) => {
                ls.forEach((pt: any) => {
                  ok = ok || isPointInPolygon(pt, polygon)
                })
              })
            })
          }
        }
        break
    }
    return ok
  }

  /** Apply filters to Resource entry
   * returns: true if entry should be included in results **/
  passFilter(res: any, type: string, params: any) {
    let ok = true
    if (params.href) {
      // ** check is attached to another resource
      // console.log(`filter related href: ${params.href}`);
      if (typeof res.href === 'undefined') {
        ok = ok && false
      } else {
        // deconstruct resource href value
        const ha = res.href.split('/')
        const hType: string =
          ha.length === 1
            ? 'regions'
            : ha.length > 2
            ? ha[ha.length - 2]
            : 'regions'
        const hId = ha.length === 1 ? ha[0] : ha[ha.length - 1]

        // deconstruct param.href value
        const pa = params.href.split('/')
        const pType: string =
          pa.length === 1
            ? 'regions'
            : pa.length > 2
            ? pa[pa.length - 2]
            : 'regions'
        const pId = pa.length === 1 ? pa[0] : pa[pa.length - 1]

        ok = ok && hType === pType && hId === pId
      }
    }
    if (params.group) {
      // ** check is attached to group
      // console.error(`check group: ${params.group}`);
      if (typeof res.group === 'undefined') {
        ok = ok && false
      } else {
        ok = ok && res.group == params.group
      }
    }
    if (params.geobounds) {
      // ** check is within bounds
      ok = ok && this.inBounds(res, type, params.geobounds)
    }
    return ok
  }

  // ** process query parameters
  processParameters(params: any) {
    if (typeof params.limit !== 'undefined') {
      if (isNaN(params.limit)) {
        throw new Error(
          `max record count specified is not a number! (${params.limit})`
        )
      } else {
        params.limit = parseInt(params.limit)
      }
    }

    if (typeof params.bbox !== 'undefined') {
      // ** generate geobounds polygon from bbox
      params.geobounds = this.toPolygon(params.bbox)
      if (params.geobounds.length !== 5) {
        params.geobounds = null
        throw new Error(
          `Bounding box contains invalid coordinate value (${params.bbox})`
        )
      }
    } else if (typeof params.distance !== 'undefined' && params.position) {
      if (isNaN(params.distance)) {
        throw new Error(
          `Distance specified is not a number! (${params.distance})`
        )
      }
      const sw = computeDestinationPoint(params.position, params.distance, 225)
      const ne = computeDestinationPoint(params.position, params.distance, 45)
      params.geobounds = this.toPolygon(
        `${sw.longitude},${sw.latitude}, ${ne.longitude}, ${ne.latitude}`
      )
    }
    return params
  }

  // ** convert bbox  string to array of points (polygon) **
  toPolygon(bbox: string) {
    const polygon = []
    const b = bbox
      .split(',')
      .filter((i: any) => {
        return !isNaN(i) && !isNaN(parseFloat(i))
      })
      .map((i: any) => {
        return parseFloat(i)
      })
    if (b.length == 4) {
      polygon.push([b[0], b[1]])
      polygon.push([b[0], b[3]])
      polygon.push([b[2], b[3]])
      polygon.push([b[2], b[1]])
      polygon.push([b[0], b[1]])
    } else {
      console.error(
        `*** Error: Bounding box contains invalid coordinate value (${bbox}) ***`
      )
    }
    return polygon
  }
}
