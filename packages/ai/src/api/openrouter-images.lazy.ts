import type { ImagesModel, ProviderImages } from "../types.js";

export const openrouterImagesApi = (): ProviderImages => ({
	generateImages: async (model, context, options) =>
		(await import("./openrouter-images.js")).generateImages(
			model as ImagesModel<"openrouter-images">,
			context,
			options,
		),
});
