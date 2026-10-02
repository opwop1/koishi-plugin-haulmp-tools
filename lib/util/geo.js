// 游戏坐标 ↔ 经纬度换算与最近城市（原 locate.js 的投影部分，定位/路况共用）
const { PLACES_URL } = require('./constant')
const { fetchJson } = require('./common')

const R = 6370997
const D2R = Math.PI / 180

const LAT1 = 37 * D2R
const LAT2 = 65 * D2R
const LAT0 = 50 * D2R
const LON0 = 15 * D2R
const N = Math.log(Math.cos(LAT1) / Math.cos(LAT2)) / Math.log(Math.tan(Math.PI / 4 + LAT2 / 2) / Math.tan(Math.PI / 4 + LAT1 / 2))
const F = (Math.cos(LAT1) * Math.pow(Math.tan(Math.PI / 4 + LAT1 / 2), N)) / N
const RHO0 = (R * F) / Math.pow(Math.tan(Math.PI / 4 + LAT0 / 2), N)
const SM = (R * Math.PI) / 180

function gameToLngLat(x, z) {
  const i = Math.floor(x / 4000)
  const r = Math.floor(z / 4000)
  let a = x - 16660
  let s = z - 4150
  if (i <= -8 && r <= -2 && !(i === -8 && r === -2)) {
    a = (a - 15550) * 0.75
    s = (s - 2750) * 0.75
  }
  const px = a * 0.0001729241463 * SM
  const py = s * -0.000171570875 * SM
  const rho = Math.sqrt(px * px + (RHO0 - py) * (RHO0 - py))
  const theta = Math.atan2(px, RHO0 - py)
  const lon = LON0 + theta / N
  const lat = 2 * Math.atan(Math.pow((R * F) / rho, 1 / N)) - Math.PI / 2
  return [lon / D2R, lat / D2R]
}

function haversine(lon1, lat1, lon2, lat2) {
  const p1 = lat1 * D2R
  const p2 = lat2 * D2R
  const dp = (lat2 - lat1) * D2R
  const dl = (lon2 - lon1) * D2R
  const a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2)
  return 6371 * 2 * Math.asin(Math.sqrt(a))
}

function mercY(lat) {
  return Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))
}

function headingBearing(p) {
  if (!Number.isFinite(p.h)) return null
  const [lonA, latA] = gameToLngLat(p.x, p.z)
  const [lonB, latB] = gameToLngLat(p.x - Math.sin(p.h), p.z - Math.cos(p.h))
  const deg = Math.atan2(((lonB - lonA) * Math.PI) / 180, mercY(latB) - mercY(latA)) * 180 / Math.PI
  return (deg + 360) % 360
}

let placesCache = null
let placesAt = 0

async function loadPlaces() {
  if (placesCache && Date.now() - placesAt < 12 * 3600 * 1000) return placesCache
  const d = await fetchJson(PLACES_URL)
  const cities = ((d && d.places) || [])
    .filter((p) => p && p.category === 'city' && Array.isArray(p.coordinates))
    .map((p) => [p.name, p.coordinates[0], p.coordinates[1]])
  placesCache = cities
  placesAt = Date.now()
  return cities
}

function nearestCity(cities, lon, lat) {
  let best = null
  let bd = Infinity
  for (const [name, clon, clat] of cities) {
    const d = haversine(lon, lat, clon, clat)
    if (d < bd) {
      bd = d
      best = name
    }
  }
  return { name: best, km: bd }
}

module.exports = { gameToLngLat, haversine, mercY, headingBearing, loadPlaces, nearestCity }
