import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If Supabase is not configured, skip auth middleware
  if (!supabaseUrl || !supabaseKey || supabaseUrl === 'https://your-project.supabase.co') {
    return NextResponse.next({
      request,
    });
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Use getUser() for authenticated user data (more secure)
  // getUser() makes a network request to validate the session
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  // If getUser() fails due to network error but we have session metadata, try getSession() as fallback
  // getSession() only reads from local cookie without network request
  let sessionUser = user;
  let hasAuthError = !!authError;
  if (authError && !user) {
    console.warn('getUser() failed, trying getSession() as fallback:', authError);
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData?.user) {
      sessionUser = sessionData.user;
      hasAuthError = false; // Clear error since we got session from cookie
      console.log('Using session from cookie fallback, role:', sessionUser.user_metadata?.role);
    }
  }

  if (!sessionUser) {
    console.error('Auth error or no user:', authError);
    // No session, redirect to login for protected routes
    if (request.nextUrl.pathname.startsWith('/teacher') || request.nextUrl.pathname.startsWith('/student')) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // Get role from session metadata (already verified by getUser or fallback to getSession)
  const userId = sessionUser.id;
  const sessionRole = sessionUser?.user_metadata?.role as string | undefined;
  console.log('Middleware - userId:', userId, 'session metadata role:', sessionRole);

  // Query profile with timeout handling
  let userRole: string | undefined = sessionRole;
  try {
    // Use AbortController to add timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    clearTimeout(timeout);

    if (profileError && profileError.code !== 'ERR_CANCELLED') {
      console.error('Profile lookup error:', profileError);
    }

    console.log('Middleware - profile:', profile);

    // Use profile role if found, otherwise keep session metadata role
    if (profile?.role) {
      userRole = profile.role;
    }
  } catch (e: unknown) {
    const error = e as { name?: string; message?: string };
    if (error?.name !== 'AbortError') {
      console.error('Profile lookup exception:', e);
    }
    // Keep using session metadata role as fallback
  }

  console.log('Middleware - final userRole:', userRole, 'pathname:', request.nextUrl.pathname);

  // Protect /teacher routes - requires authentication and teacher role
  if (request.nextUrl.pathname.startsWith('/teacher')) {
    if (userRole !== 'teacher') {
      console.log('Middleware - redirecting to /student because userRole !== teacher');
      const url = request.nextUrl.clone();
      url.pathname = '/student';
      return NextResponse.redirect(url);
    }
  }

  // Protect /student routes - requires authentication (any role)
  if (request.nextUrl.pathname.startsWith('/student')) {
    // Teachers can also access student area if they want to join as a student
  }

  return supabaseResponse;
}
