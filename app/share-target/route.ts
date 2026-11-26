/**
 * EC-SHR-16: normally the service worker answers POST /share-target. Right
 * after install it may not be active yet, so the share reaches the server:
 * redirect to the review screen with a "try again" message instead of a 404.
 * The shared files are not read or kept.
 */
export function POST(request: Request) {
  return Response.redirect(
    new URL("/add/review?share_error=1", request.url),
    303,
  );
}

export function GET(request: Request) {
  return Response.redirect(new URL("/add", request.url), 303);
}
