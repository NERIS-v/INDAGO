import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-8">
      <div className="text-center space-y-6 animate-fade-in">
        <div className="flex h-20 w-20 mx-auto items-center justify-center rounded-2xl bg-surface-100 border border-surface-200/40">
          <svg className="h-10 w-10 text-surface-400" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 16.318A4.486 4.486 0 0 0 12.016 15a4.486 4.486 0 0 0-3.198 1.318M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Z" />
          </svg>
        </div>
        <div>
          <h1 className="text-lg font-medium tracking-wide text-surface-700">404</h1>
          <p className="mt-2 text-xs text-surface-500">Page not found.</p>
        </div>
        <Link href="/">
          <Button variant="secondary">Go to Dashboard</Button>
        </Link>
      </div>
    </div>
  );
}
