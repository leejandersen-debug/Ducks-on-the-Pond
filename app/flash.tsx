// Shows the ?ok= / ?error= message an action redirected back with.
export function Flash({ ok, error }: { ok?: string; error?: string }) {
  if (error) return <p role="alert" className="flash error"><strong>Error:</strong> {error}</p>;
  if (ok) return <p role="status" className="flash ok"><strong>Done:</strong> {ok}</p>;
  return null;
}

export type FlashParams = Promise<{ ok?: string; error?: string; [key: string]: string | string[] | undefined }>;
