"use client";

import { usePathname } from "next/navigation";

/** Static seam blocks in the shape of the screen that is loading; no shimmer. */
function Block({ className }: { className: string }) {
  return <div aria-hidden="true" className={`rounded-sm bg-seam ${className}`} />;
}

function PileSkeleton() {
  return (
    <div className="sm-screen grid lg:grid-cols-[296px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_360px]">
      <div className="space-y-5 border-r border-seam bg-fog p-5">
        <Block className="h-4 w-32" />
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Block className="h-11 w-10" />
            <div className="flex-1 space-y-2">
              <Block className="h-3.5 w-4/5" />
              <Block className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
      <div className="hidden space-y-4 bg-sheet p-5 lg:block">
        <Block className="h-6 w-2/3" />
        <Block className="h-4 w-full max-w-[72ch]" />
        <Block className="h-4 w-5/6 max-w-[72ch]" />
        <Block className="h-9 w-48" />
      </div>
      <div className="hidden space-y-3 border-l border-seam bg-sheet p-5 xl:block">
        <Block className="h-4 w-40" />
        <Block className="h-3.5 w-3/4" />
        <Block className="h-3.5 w-2/3" />
      </div>
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div className="mx-auto max-w-[1184px] space-y-8">
      <div className="space-y-2">
        <Block className="h-3.5 w-28" />
        <Block className="h-6 w-2/3 max-w-xl" />
      </div>
      {Array.from({ length: 3 }).map((_, section) => (
        <div key={section} className="space-y-4">
          <Block className="h-4 w-24" />
          {Array.from({ length: 3 }).map((_, field) => (
            <div key={field} className="space-y-1.5">
              <Block className="h-3.5 w-20" />
              <Block className="h-9 w-full max-w-[656px]" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Block className="h-6 w-40" />
        <Block className="h-3.5 w-72 max-w-full" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Block className="h-[30px] w-[300px] max-w-full" />
        <Block className="h-[30px] w-48" />
      </div>
      <div className="border-t border-seam">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-seam bg-sheet px-4 py-2">
            <Block className="h-11 w-10" />
            <div className="flex-1 space-y-2">
              <Block className="h-3.5 w-2/5" />
              <Block className="h-3 w-1/4" />
            </div>
            <Block className="h-3.5 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

const EDITOR_PATH = /^\/admin\/(?:[^/]+\/)*(?:new|edit)$|^\/admin\/(?:events|submissions|venues|markets|vendors|users)\/[^/]+$/;

export default function AdminLoading() {
  const pathname = usePathname();
  const skeleton =
    pathname === "/admin" ? <PileSkeleton /> : EDITOR_PATH.test(pathname) ? <EditorSkeleton /> : <ListSkeleton />;
  return (
    <>
      <p role="status" className="sr-only">
        Loading
      </p>
      {skeleton}
    </>
  );
}
