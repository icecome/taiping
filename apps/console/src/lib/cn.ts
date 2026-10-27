import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** 合并类名：clsx 处理条件，tailwind-merge 消解冲突（后者胜出）。 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
