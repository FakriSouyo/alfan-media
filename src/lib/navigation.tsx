import { forwardRef, useMemo, type AnchorHTMLAttributes, type ImgHTMLAttributes } from "react";
import { Link as RouterLink, useLocation, useNavigate, useParams as routeParams } from "react-router-dom";

export const Link = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }>(function Link({ href, prefetch: _prefetch, ...props }, ref) {
  return <RouterLink ref={ref} to={href} {...props} />;
});

export function Image({ priority, fill, sizes, ...props }: ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean; fill?: boolean }) {
  return <img {...props} sizes={sizes} loading={priority ? "eager" : "lazy"} style={fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...props.style } : props.style} />;
}

export function useRouter() {
  const navigate = useNavigate();
  return useMemo(() => ({ push: (to: string) => navigate(to), replace: (to: string) => navigate(to, { replace: true }), back: () => navigate(-1), refresh: () => window.location.reload() }), [navigate]);
}
export function usePathname() { return useLocation().pathname; }
export function useSearchParams() { const { search } = useLocation(); return useMemo(() => new URLSearchParams(search), [search]); }
export function useParams() { const params = routeParams<{ id: string }>(); return { id: params.id ?? "" }; }
