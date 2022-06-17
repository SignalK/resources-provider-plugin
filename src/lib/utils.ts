import { computeDestinationPoint, isPointInPolygon } from 'geolib'

export const UUID_PREFIX = 'urn:mrn:signalk:uuid:'

// check geometry is in bounds
export const inBounds = (
  val: any,
  type: string,
  polygon: number[]
): boolean => {
  let ok = false
  switch (type) {
    case 'notes':
      if (val.position) {
        ok = isPointInPolygon(val.position, polygon)
      }
      break
    case 'waypoints':
      if (val?.feature?.geometry?.coordinates) {
        ok = isPointInPolygon(val?.feature?.geometry?.coordinates, polygon)
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

/* Apply filters to Resource entry
 * returns: true if entry should be included in results */
export const passFilter = (res: any, type: string, params: any) => {
  let ok = true
  if (params.href) {
    // check is attached to another resource
    if (!res.href) {
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
    // check is attached to group
    // console.error(`check group: ${params.group}`);
    if (typeof res.group === 'undefined') {
      ok = ok && false
    } else {
      ok = ok && res.group == params.group
    }
  }
  if (params.geobounds) {
    // check is within bounds
    ok = ok && inBounds(res, type, params.geobounds)
  }
  return ok
}

// process query parameters
export const processParameters = (params: any) => {
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
    // generate geobounds polygon from bbox
    params.geobounds = toPolygon(params.bbox)
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
    let sw = computeDestinationPoint(params.position, params.distance, 225)
    let dlpt = parseDatelineCrossing([
      params.position,
      [sw.longitude, sw.latitude]
    ])[1]
    sw = {
      latitude: dlpt[1],
      longitude: dlpt[0]
    }
    let ne = computeDestinationPoint(params.position, params.distance, 45)
    dlpt = parseDatelineCrossing([
      params.position,
      [ne.longitude, ne.latitude]
    ])[1]
    ne = {
      latitude: dlpt[1],
      longitude: dlpt[0]
    }
    params.geobounds = toPolygon([
      sw.longitude,
      sw.latitude,
      ne.longitude,
      ne.latitude
    ])
  }
  return params
}

// convert bbox  string to array of points (polygon)
export const toPolygon = (bbox: number[]) => {
  const polygon = []
  if (bbox.length == 4) {
    polygon.push([bbox[0], bbox[1]])
    polygon.push([bbox[0], bbox[3]])
    polygon.push([bbox[2], bbox[3]])
    polygon.push([bbox[2], bbox[1]])
    polygon.push([bbox[0], bbox[1]])
  } else {
    console.error(
      `*** Error: Bounding box contains invalid coordinate value (${bbox}) ***`
    )
  }
  return polygon
}

/* DateLine Crossing:
 * returns true if point is in the zone for dateline transition
 * zoneValue: lower end of 180 to xx range within which Longitude must fall for retun value to be true
 */
const inDLCrossingZone = (coord: [number, number], zoneValue = 170) => {
  return Math.abs(coord[0]) >= zoneValue ? true : false
}

// parse coord array to address dateline crossing(s)
const parseDatelineCrossing = (coords: Array<[number, number]>) => {
  if (coords.length == 0) {
    return coords
  }
  let dlCrossing = 0
  const last = coords[0]
  for (let i = 0; i < coords.length; i++) {
    if (inDLCrossingZone(coords[i]) || inDLCrossingZone(last)) {
      dlCrossing =
        last[0] > 0 && coords[i][0] < 0
          ? 1
          : last[0] < 0 && coords[i][0] > 0
          ? -1
          : 0
      if (dlCrossing == 1) {
        coords[i][0] = coords[i][0] + 360
      }
      if (dlCrossing == -1) {
        coords[i][0] = Math.abs(coords[i][0]) - 360
      }
    }
  }
  return coords
}
