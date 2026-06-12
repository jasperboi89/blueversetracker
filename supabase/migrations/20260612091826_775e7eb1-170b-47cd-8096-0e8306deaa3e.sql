REVOKE ALL ON FUNCTION public.link_authorized_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_authorized_user() TO service_role;
