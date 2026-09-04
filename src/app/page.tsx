import Landing from "./Landing";

// Static: no cookies, no session read. Logged-in visitors are sent to /map by
// the proxy. That keeps the pitch CDN-cacheable and means `/` still renders
// when SESSION_SECRET is unset (preview / local without .env).
export default function Home() {
  return <Landing />;
}
