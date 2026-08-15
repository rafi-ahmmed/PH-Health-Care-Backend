import type z from "zod";
import { catchAsync } from "../utils/catchAsync";

export const validateRequest = (zodScheme: z.ZodObject) => {
	return catchAsync((req, res, next) => {
		const payload = req.body ?? {};
		const result = zodScheme.safeParse(payload);

		if (!result.success) {
			console.log(result.error.issues);
			throw new Error(result.error.issues[0].message);
		}

		req.body = result.data;
		next();
	});
};
