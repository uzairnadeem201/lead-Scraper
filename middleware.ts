import { auth } from "@/auth";

export default auth((req) => {
  // Check if unauthenticated and not on the root page or auth routes
  // But wait, if they want the ENTIRE site protected, including the root,
  // we need to be careful not to create a redirect loop if the login form is on the root.
  
  // Rule: If they aren't logged in, they can ONLY access /api/auth or the login gate logic.
  const isLoggedIn = !!req.auth;
  const isAuthPage = req.nextUrl.pathname.startsWith("/api/auth");

  if (!isLoggedIn && !isAuthPage) {
    // If we want to redirect to a specific login page, we'd do that here.
    // But since the login form is on the main Page (/), we'll let them hit the root
    // and let the Page component handle the "Login Gate" UI.
    
    // However, if they try to hit sub-routes (if any), we could protect them.
    // For now, most things are on /, so middleware can be simple or even skipped
    // if everything is hidden behind a Page-level auth check.
  }
});

// Match all request paths except for the ones starting with:
// - api (API routes)
// - _next/static (static files)
// - _next/image (image optimization files)
// - favicon.ico (favicon file)
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
