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

  // Use getSession instead of getUser to avoid token lock race condition
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    // No session, redirect to login for protected routes
    if (request.nextUrl.pathname.startsWith('/teacher') || request.nextUrl.pathname.startsWith('/student')) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // Get user role from profiles table (more reliable than session metadata)
  const userId = session.user.id;
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  const userRole = profile?.role || session?.user?.user_metadata?.role;

  // Protect /teacher routes - requires authentication and teacher role
  if (request.nextUrl.pathname.startsWith('/teacher')) {
    if (userRole !== 'teacher') {
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
