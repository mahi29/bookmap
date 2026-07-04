"use server";

import { redirect } from "next/navigation";
import { deleteSession } from "@/infrastructure/auth/session";

export async function logout(): Promise<void> {
  await deleteSession();
  redirect("/login");
}
