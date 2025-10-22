import { toast } from "@/components/ui/use-toast";

export async function copyToClipboard(text: string, description?: string) {
  if (!text) {
    toast({
      title: "没有可复制的内容",
      variant: "destructive"
    });
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast({
      title: "已复制",
      description: description ?? text.slice(0, 120)
    });
  } catch (error) {
    toast({
      title: "复制失败",
      description: (error as Error).message,
      variant: "destructive"
    });
  }
}
