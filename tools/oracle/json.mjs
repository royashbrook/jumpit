// Reference recordings contain no non-finite numbers or negative zero. Refuse them rather than
// allowing JSON to silently turn a broken result into an expected null or zero.
export function recordedJSON(value) {
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === 'number' && (!Number.isFinite(item) || Object.is(item, -0))) {
      throw new Error(`unrepresentable number in reference recording: ${Object.is(item, -0) ? '-0' : String(item)}`)
    }
    return item
  })
}
