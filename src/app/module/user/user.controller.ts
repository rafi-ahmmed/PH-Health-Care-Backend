import type { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { UserService } from "./user.service";

const uploadProfileImage = catchAsync(
	async (req: Request, res: Response, next: NextFunction) => {
		const userId = req.user?.userId as string;
		if (!req.file) {
			throw new Error("File not Provided");
		}
		const result = await UserService.uploadProfileImage(
			req.file?.buffer,
			userId as string,
		);
		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Image uploaded successfully",
			data: result,
		});
	},
);

// const uploadProfileImage = catchAsync(
// 	async (req: Request, res: Response, next: NextFunction) => {
// 		sendResponse(res, {
// 			statusCode: httpStatus.OK,
// 			success: true,
// 			message: "Password Updated Successfully",
// 			data: null,
// 		});
// 	},
// );

export const UserController = { uploadProfileImage };
