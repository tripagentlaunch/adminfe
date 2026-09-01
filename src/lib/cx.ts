// cx(...args) — tiny classname joiner. Ported from web/js/advisor.js (line ~59).
// Accepts strings (pushed as-is) and objects (keys pushed when truthy).
export function cx(...args: any[]): string {
  var out: string[] = [];
  for (var i = 0; i < args.length; i++) {
    var a = args[i];
    if (!a) continue;
    if (typeof a === "string") out.push(a);
    else if (typeof a === "object") {
      for (var k in a) if (a[k]) out.push(k);
    }
  }
  return out.join(" ");
}
