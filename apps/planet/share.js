import { PLACES, SHAPES } from './effort.js';

// Then the version: 1, or 2 when the week carries effort (effort.js), appended to each activity after its route.
const MAGIC = [0x50, 0x43];
const EPOCH = Date.UTC(2000, 0, 3);
const DAY = 86400000;
const SPORTS = ['', 'running', 'walking', 'hiking', 'cycling', 'swimming', 'training', 'fitness_equipment'];
const NOUNS = ['activity', 'run', 'walk', 'hike', 'ride', 'swim', 'yoga', 'lift', 'treadmill', 'stair stepper', 'football', 'race'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

class Writer {
  constructor() { this.bytes = []; }
  byte(value) { this.bytes.push(value & 255); }
  varint(value) {
    let n = Math.max(0, Math.round(value));
    while (n >= 128) {
      this.byte((n & 127) | 128);
      n = Math.floor(n / 128);
    }
    this.byte(n);
  }
  string(value) {
    const bytes = encoder.encode(String(value || ''));
    if (bytes.length > 1024) throw new Error('Activity labels must be under 1,024 bytes.');
    this.varint(bytes.length);
    for (const byte of bytes) this.byte(byte);
  }
}

class Reader {
  constructor(bytes) { this.bytes = bytes; this.index = 0; }
  byte() {
    if (this.index >= this.bytes.length) throw new Error('Planet link is incomplete.');
    return this.bytes[this.index++];
  }
  varint() {
    let value = 0;
    let scale = 1;
    for (let i = 0; i < 5; i++) {
      const byte = this.byte();
      value += (byte & 127) * scale;
      if (!(byte & 128)) return value;
      scale *= 128;
    }
    throw new Error('Planet link contains an invalid number.');
  }
  string() {
    const length = this.varint();
    if (length > 1024 || this.index + length > this.bytes.length) throw new Error('Planet link contains an invalid label.');
    const value = decoder.decode(this.bytes.subarray(this.index, this.index + length));
    this.index += length;
    return value;
  }
}

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const q = (value, step = 1) => finite(value) ? Math.max(0, Math.round(value / step)) + 1 : 0;
const uq = (value, step = 1) => value ? (value - 1) * step : null;
const zig = (value) => value < 0 ? -value * 2 - 1 : value * 2;
const unzig = (value) => value & 1 ? -(value + 1) / 2 : value / 2;
const qs = (value, step = 1) => finite(value) ? zig(Math.round(value / step)) + 1 : 0;
const uqs = (value, step = 1) => value ? unzig(value - 1) * step : null;

function checksum(bytes) {
  let hash = 2166136261;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619);
  return hash >>> 0;
}

function base64url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unbase64url(value) {
  if (!value || value.length > 32768 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('That is not a Planet Creator link.');
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  let binary;
  try { binary = atob(padded); } catch { throw new Error('That Planet Creator link is damaged.'); }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function segmentDistanceSq(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  if (!dx && !dy) return (point[0] - start[0]) ** 2 + (point[1] - start[1]) ** 2;
  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy)));
  return (point[0] - start[0] - t * dx) ** 2 + (point[1] - start[1] - t * dy) ** 2;
}

function douglasPeucker(points, tolerance) {
  if (points.length <= 2) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [0, points.length - 1];
  const threshold = tolerance * tolerance;
  while (stack.length) {
    const end = stack.pop();
    const start = stack.pop();
    let best = threshold;
    let at = -1;
    for (let i = start + 1; i < end; i++) {
      const distance = segmentDistanceSq(points[i], points[start], points[end]);
      if (distance > best) { best = distance; at = i; }
    }
    if (at >= 0) {
      keep[at] = 1;
      stack.push(start, at, at, end);
    }
  }
  return points.filter((_, index) => keep[index]);
}

export function simplifyRoute(points, limit = 40) {
  const clean = (Array.isArray(points) ? points : []).filter((point) => Array.isArray(point) && finite(point[0]) && finite(point[1]));
  if (clean.length <= limit) return clean.map(([x, y]) => [x, y]);
  let low = 0;
  let high = Math.SQRT2;
  let best = [clean[0], clean[clean.length - 1]];
  for (let i = 0; i < 18; i++) {
    const middle = (low + high) / 2;
    const candidate = douglasPeucker(clean, middle);
    if (candidate.length > limit) low = middle;
    else { high = middle; best = candidate; }
  }
  return best;
}

// values of `width` bits each, packed low bits first
function packBits(values, width) {
  const packed = [];
  let bits = 0;
  let count = 0;
  for (const value of values) {
    bits |= value << count;
    count += width;
    while (count >= 8) {
      packed.push(bits & 255);
      bits >>>= 8;
      count -= 8;
    }
  }
  if (count) packed.push(bits & 255);
  return packed;
}

function unpackBits(reader, count, width) {
  const bytes = new Uint8Array(Math.ceil(count * width / 8));
  for (let i = 0; i < bytes.length; i++) bytes[i] = reader.byte();
  const mask = (1 << width) - 1;
  const values = [];
  let bits = 0;
  let bitCount = 0;
  let index = 0;
  while (values.length < count) {
    while (bitCount < width) {
      bits |= bytes[index++] << bitCount;
      bitCount += 8;
    }
    values.push(bits & mask);
    bits >>>= width;
    bitCount -= width;
  }
  return values;
}

function packRoute(points) {
  return packBits(points.flatMap((point) => point.map((coordinate) => Math.max(0, Math.min(63, Math.round(coordinate * 63))))), 6);
}

function unpackRoute(reader, count) {
  const values = unpackBits(reader, count * 2, 6);
  const points = [];
  for (let i = 0; i < values.length; i += 2) points.push([values[i] / 63, values[i + 1] / 63]);
  return points;
}

// The effort fields as a link keeps them (effort.js): null for anything malformed, so a bad value is never written,
// and splits only on a race, the one thing that draws them.
const ribbonOf = (value) => Array.isArray(value) && value.length === 12 && value.every((x) => Number.isInteger(x) && x >= 0 && x <= 7) ? value : null;
const repsOf = (value) => Number.isInteger(value) && value > 0 ? value : null;
const splitsOf = (a) => a.isRace && Array.isArray(a.splits) && a.splits.length >= 1 && a.splits.length <= 64 && a.splits.every((x) => finite(x) && x >= 0.5)
  ? a.splits.map((x) => Math.round(x)) : null;
const inclineOf = (value) => finite(value) && value >= 0.5 ? Math.round(value) : null;
const hasEffort = (a) => PLACES.includes(a.place) || SHAPES.includes(a.shape) || !!ribbonOf(a.ribbon) || !!repsOf(a.reps)
  || !!splitsOf(a) || inclineOf(a.inclineM) != null;

function writeEffort(writer, activity) {
  const ribbon = ribbonOf(activity.ribbon), reps = repsOf(activity.reps), splits = splitsOf(activity), incline = inclineOf(activity.inclineM);
  writer.byte((PLACES.indexOf(activity.place) + 1) | (SHAPES.indexOf(activity.shape) + 1) << 4);
  writer.byte((ribbon ? 1 : 0) | (reps ? 2 : 0) | (splits ? 4 : 0) | (incline != null ? 8 : 0));
  if (ribbon) for (const byte of packBits(ribbon, 3)) writer.byte(byte);
  if (reps) writer.varint(reps);
  if (splits) {
    writer.varint(splits.length);
    writer.varint(splits[0]);
    for (let i = 1; i < splits.length; i++) writer.varint(zig(splits[i] - splits[i - 1]));
  }
  if (incline != null) writer.varint(incline);
}

function readEffort(reader) {
  const kinds = reader.byte();
  const flags = reader.byte();
  const place = kinds & 15, shape = kinds >> 4;
  if (place > PLACES.length || shape > SHAPES.length || flags > 15) throw new Error('That Planet Creator link contains an invalid effort.');
  const effort = { place: PLACES[place - 1] ?? null, shape: SHAPES[shape - 1] ?? null, ribbon: null, reps: null, splits: null };
  if (flags & 1) effort.ribbon = unpackBits(reader, 12, 3);
  if (flags & 2) effort.reps = reader.varint();
  if (flags & 4) {
    const count = reader.varint();
    if (count < 1 || count > 64) throw new Error('That Planet Creator link contains invalid splits.');
    effort.splits = [reader.varint()];
    for (let i = 1; i < count; i++) effort.splits.push(effort.splits[i - 1] + unzig(reader.varint()));
  }
  if (flags & 8) effort.inclineM = reader.varint();
  if (effort.reps === 0 || effort.splits?.some((x) => x <= 0)) throw new Error('That Planet Creator link contains an invalid effort.');
  return effort;
}

// a race on foot, by its distance: the words the shelf, the reading and a body's reason name it by
export function raceName(a) {
  const km = (a.distanceM || 0) / 1000;
  if (!/^(running|walking|hiking)$/.test(a.sport)) return 'a race';
  if (km > 43.5) return 'an ultra';
  if (km >= 41.5) return 'the marathon';
  if (km >= 20.6 && km <= 21.7) return 'a half marathon';
  if (km >= 15.8 && km <= 16.5) return 'a ten-mile race';
  if (km >= 9.7 && km <= 10.4) return 'a 10K';
  if (km >= 4.8 && km <= 5.3) return 'a 5K';
  return 'a race';
}

function nounFor(activity) {
  const title = String(activity.title || '').toLowerCase();
  if (activity.isRace) return 'race';
  if (/yoga|pilates|stretch|breath|mobility/.test(title)) return 'yoga';
  if (/strength|lift|weight/.test(title)) return 'lift';
  if (/stair/.test(title)) return 'stair stepper';
  if (/treadmill/.test(title)) return 'treadmill';
  if (/football/.test(title)) return 'football';
  return ({ running: 'run', walking: 'walk', hiking: 'hike', cycling: 'ride', swimming: 'swim', training: 'lift' })[activity.sport] || 'activity';
}

function totals(activities) {
  const sum = (key) => activities.reduce((total, activity) => total + (finite(activity[key]) ? activity[key] : 0), 0);
  return {
    activities: activities.length,
    runs: activities.filter((activity) => activity.sport === 'running').length,
    distanceMi: sum('distanceM') / 1609.344,
    ascentM: sum('ascentM'),
    sweatMl: sum('sweatMl'),
    activeMin: sum('activeS') / 60,
    trainingLoad: sum('trainingLoad'),
  };
}

export function encodePlanet(seed, { includeNames = false } = {}) {
  if (!seed || !/^\d{4}-\d{2}-\d{2}$/.test(seed.week) || !Array.isArray(seed.activities)) throw new Error('Planet data needs a dated training week.');
  if (seed.activities.length > 127) throw new Error('A planet can contain at most 127 activities.');
  const weekTime = Date.parse(`${seed.week}T00:00:00Z`);
  if (!Number.isFinite(weekTime)) throw new Error('Planet week is not a valid date.');

  const writer = new Writer();
  // a week with no effort field anywhere is written as version 1, the link it has always had
  const version = seed.activities.some(hasEffort) ? 2 : 1;
  for (const byte of MAGIC) writer.byte(byte);
  writer.byte(version);
  writer.byte(includeNames ? 1 : 0);
  writer.varint(Math.round((weekTime - EPOCH) / DAY));
  writer.varint(seed.activities.length);

  for (const activity of seed.activities) {
    const sportCode = SPORTS.indexOf(activity.sport);
    writer.varint(sportCode < 0 ? 0 : sportCode);
    if (sportCode < 0) writer.string(activity.sport || 'other');
    writer.varint(Math.max(0, NOUNS.indexOf(nounFor(activity))));
    const start = Date.parse(activity.startedAt);
    writer.varint(Number.isFinite(start) ? Math.max(0, Math.min(10079, Math.round((start - weekTime) / 60000))) : 0);

    const route = activity.hasGps ? simplifyRoute(activity.routeShape, 40) : [];
    const strength = activity.strength && finite(activity.strength.sets);
    writer.byte((activity.isRace ? 1 : 0) | (route.length > 1 ? 2 : 0) | (strength ? 4 : 0));
    if (includeNames) writer.string(activity.title || '');

    for (const value of [
      q(activity.distanceM, 10), q(activity.activeS, 5), q(activity.ascentM), q(activity.avgHeartRate), q(activity.maxHeartRate),
      ...Array.from({ length: 5 }, (_, index) => q(activity.hrZoneSeconds?.[index], 5)),
      q(activity.sweatMl, 10), qs(activity.minTempC), qs(activity.maxTempC), q(activity.avgCadence), q(activity.avgSpeedMps, 0.01),
      q(activity.trainingLoad, 0.5), q(activity.aerobicEffect, 0.1), q(activity.anaerobicEffect, 0.1), q(activity.laps), q(activity.routeSpanM, 10),
    ]) writer.varint(value);

    if (strength) {
      writer.varint(q(activity.strength.sets));
      writer.varint(q(activity.strength.reps));
      writer.varint(q(activity.strength.volumeKg));
    }
    if (route.length > 1) {
      writer.varint(route.length);
      for (const byte of packRoute(route)) writer.byte(byte);
    }
    if (version === 2) writeEffort(writer, activity);
  }

  const body = Uint8Array.from(writer.bytes);
  const hash = checksum(body);
  writer.byte(hash); writer.byte(hash >>> 8); writer.byte(hash >>> 16); writer.byte(hash >>> 24);
  return base64url(Uint8Array.from(writer.bytes));
}

export function decodePlanet(value) {
  const all = unbase64url(String(value || ''));
  if (all.length < 10) throw new Error('That Planet Creator link is incomplete.');
  const body = all.subarray(0, -4);
  const expected = all[all.length - 4] | all[all.length - 3] << 8 | all[all.length - 2] << 16 | all[all.length - 1] << 24;
  if (checksum(body) !== (expected >>> 0)) throw new Error('That Planet Creator link is damaged.');

  const reader = new Reader(body);
  if (reader.byte() !== MAGIC[0] || reader.byte() !== MAGIC[1]) throw new Error('That Planet Creator link uses an unsupported format.');
  const version = reader.byte();
  if (version !== 1 && version !== 2) throw new Error('That Planet Creator link uses an unsupported format.');
  const includeNames = !!(reader.byte() & 1);
  const weekDays = reader.varint();
  if (weekDays > 73048) throw new Error('That Planet Creator link contains an invalid week.');
  const weekTime = EPOCH + weekDays * DAY;
  const week = new Date(weekTime).toISOString().slice(0, 10);
  const count = reader.varint();
  if (count > 127) throw new Error('That Planet Creator link contains too many activities.');

  const activities = [];
  const duplicateNames = new Map();
  for (let i = 0; i < count; i++) {
    const sportCode = reader.varint();
    const sport = sportCode ? SPORTS[sportCode] : reader.string();
    if (!sport) throw new Error('That Planet Creator link contains an unknown sport.');
    const noun = NOUNS[reader.varint()] || 'activity';
    const startedAt = new Date(weekTime + reader.varint() * 60000).toISOString();
    const flags = reader.byte();
    let title = includeNames ? reader.string() : '';
    if (!title) {
      const base = `${DAYS[new Date(startedAt).getUTCDay()]} ${noun}`;
      const seen = (duplicateNames.get(base) || 0) + 1;
      duplicateNames.set(base, seen);
      title = seen === 1 ? base : `${base} ${seen}`;
    }

    const values = Array.from({ length: 20 }, () => reader.varint());
    const activity = {
      id: `${week}:${i}`,
      sport,
      startedAt,
      title,
      distanceM: uq(values[0], 10),
      activeS: uq(values[1], 5),
      ascentM: uq(values[2]),
      avgHeartRate: uq(values[3]),
      maxHeartRate: uq(values[4]),
      hrZoneSeconds: values.slice(5, 10).every((entry) => entry === 0) ? null : values.slice(5, 10).map((entry) => uq(entry, 5) ?? 0),
      sweatMl: uq(values[10], 10),
      minTempC: uqs(values[11]),
      maxTempC: uqs(values[12]),
      avgCadence: uq(values[13]),
      avgSpeedMps: uq(values[14], 0.01),
      trainingLoad: uq(values[15], 0.5),
      aerobicEffect: uq(values[16], 0.1),
      anaerobicEffect: uq(values[17], 0.1),
      laps: uq(values[18]),
      hasGps: !!(flags & 2),
      isRace: !!(flags & 1),
      routeSpanM: uq(values[19], 10),
    };
    if (flags & 4) activity.strength = { sets: uq(reader.varint()), reps: uq(reader.varint()), volumeKg: uq(reader.varint()) };
    if (flags & 2) {
      const routePoints = reader.varint();
      if (routePoints < 2 || routePoints > 40) throw new Error('That Planet Creator link contains an invalid route.');
      activity.routeShape = unpackRoute(reader, routePoints);
    }
    if (version === 2) Object.assign(activity, readEffort(reader));
    activities.push(activity);
  }
  if (reader.index !== body.length) throw new Error('That Planet Creator link contains unexpected data.');
  return { week, race: activities.find((activity) => activity.isRace)?.title || null, activities, totals: totals(activities) };
}
