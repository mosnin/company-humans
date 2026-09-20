export const usePathname = () => `/workspace/${new URLSearchParams(window.location.search).get("screen") ?? "people"}`;
export const useRouter = () => ({ refresh() { window.dispatchEvent(new Event("test:refresh")); } });
