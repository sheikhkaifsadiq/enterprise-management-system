import { supabase } from "@/integrations/supabase/client";

const BUCKET = "product-images";
// Signed URLs expire; use 1 year. Re-sign on demand if needed.
const ONE_YEAR = 60 * 60 * 24 * 365;

export async function uploadProductImage(file: File): Promise<string> {
  if (file.size > 5 * 1024 * 1024) throw new Error("Image must be under 5MB");
  if (!file.type.startsWith("image/")) throw new Error("File must be an image");

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type, upsert: false,
  });
  if (upErr) throw upErr;

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, ONE_YEAR);
  if (error) throw error;
  return data.signedUrl;
}
