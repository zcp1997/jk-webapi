import { invoke } from "@tauri-apps/api/core";
import CryptoJS from "crypto-js";

export async function md5UpperHex(input: string): Promise<string> {
  if (!input) return "";
  try {
    return await invoke<string>("md5_upper_hex", { input });
  } catch {
    const hash = CryptoJS.MD5(input);
    return hash.toString(CryptoJS.enc.Hex).toUpperCase();
  }
}
