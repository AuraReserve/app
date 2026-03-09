"use client";

import { Space } from "@/lib/entities";
import type { Space as SpaceType } from "@/lib/entities/types";
import { useAsyncData } from "@/hooks/useAsyncData";

export interface UseSpaceReturn {
  space: SpaceType | null;
  isLoading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useSpace(slug: string): UseSpaceReturn {
  const { data, isLoading, error, reload } = useAsyncData<SpaceType[]>({
    fetchFn: () => Space.filter({ slug } as Partial<SpaceType>),
    deps: [slug],
  });

  return {
    space: data?.[0] ?? null,
    isLoading,
    error,
    reload,
  };
}
