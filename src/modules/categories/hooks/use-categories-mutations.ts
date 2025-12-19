"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createCategoryAction } from "../actions/create-category.action";
import { deleteCategoryAction } from "../actions/delete-category.action";
import { updateCategoryAction } from "../actions/update-category.action";
import { categoriesQueryKey } from "../queries/query-keys";
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
} from "../service/categories.service";

export function useCategoryMutations(orgSlug: string) {
  const queryClient = useQueryClient();

  const createCategory = useMutation({
    mutationFn: async (payload: Omit<CreateCategoryInput, "orgSlug">) => {
      const result = await createCategoryAction({
        orgSlug,
        ...payload,
      });

      if (!result.success) {
        throw new Error(result.error || "No se pudo crear la categoría");
      }

      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: categoriesQueryKey(orgSlug),
      });
    },
  });

  const updateCategory = useMutation({
    mutationFn: async (
      payload: UpdateCategoryInput & { categoryId: string }
    ) => {
      const result = await updateCategoryAction(payload);

      if (!result.success) {
        throw new Error(result.error || "No se pudo actualizar la categoría");
      }

      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: categoriesQueryKey(orgSlug),
      });
    },
  });

  const deleteCategory = useMutation({
    mutationFn: async (categoryId: string) => {
      const result = await deleteCategoryAction({ categoryId });

      if (!result.success) {
        throw new Error(result.error || "No se pudo eliminar la categoría");
      }

      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: categoriesQueryKey(orgSlug),
      });
    },
  });

  return {
    createCategory,
    updateCategory,
    deleteCategory,
  };
}
