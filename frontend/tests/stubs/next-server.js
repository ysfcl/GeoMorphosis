export const NextResponse = {
  json(payload, init = {}) {
    return Response.json(payload, init);
  },
};
