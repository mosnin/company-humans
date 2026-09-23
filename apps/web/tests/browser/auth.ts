// Component harness only. Production imports the real Convex Auth hook.
export function useAuthActions() {
  return {
    signIn: async (provider: string, options: { redirectTo: string }) => {
      const response = await fetch("/mock-auth/sign-in", { method:"POST",body:JSON.stringify({provider,...options}) });
      if (!response.ok) throw new Error("Test sign-in denial");
    },
    signOut: async () => {
      const response = await fetch("/mock-auth/sign-out",{method:"POST"});
      if (!response.ok) throw new Error("Test sign-out denial");
    },
  };
}
