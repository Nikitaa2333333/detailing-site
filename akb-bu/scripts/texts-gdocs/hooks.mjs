export async function resolve(spec, ctx, next) {
  const r = await next(spec, ctx);
  if (r.url.endsWith('.json')) return { ...r, importAttributes: { type: 'json' } };
  return r;
}
