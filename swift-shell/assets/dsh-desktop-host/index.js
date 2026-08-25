// Host half of the desktop host bridge: a no-op so the profile Loader entry
// resolves (the include loader imports every entry's package root). All bridge
// behavior lives in the browser half served through exports["./client"].
export function apply() {}
