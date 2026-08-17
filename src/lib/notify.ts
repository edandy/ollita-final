export async function notifySuccess(message: string) {
  const { toast } = await import("sonner");
  toast.success(message);
}

export async function notifyError(message: string) {
  const { toast } = await import("sonner");
  toast.error(message);
}
