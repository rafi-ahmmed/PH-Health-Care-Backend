import type { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { doctorServices } from "./doctor.service";
import { applyForDoctorValidationSchema } from "./doctor.validation";

const applyForDoctor = catchAsync(
	async (req: Request, res: Response, next: NextFunction) => {
		const files = req.files as { [fieldName: string]: Express.Multer.File[] };

		const resume = files?.["resume"] ? files["resume"][0] : null;
		const additionalFiles = files?.["additionalFiles"] || [];

		const zodValidationResult = applyForDoctorValidationSchema.safeParse(
			JSON.parse(req.body.data),
		);

		if (!zodValidationResult.success) {
			throw new Error(zodValidationResult.error.issues[0].message);
		}

		const payload = zodValidationResult.data;
		const result = await doctorServices.applyForDoctor(
			resume,
			additionalFiles,
			payload,
		);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Doctor application submitted successfully.",
			data: result,
		});
	},
);

const verifyDoctorEmail = catchAsync(
	async (req: Request, res: Response, next: NextFunction) => {
		const payload = req.body;

		const result = await doctorServices.verifyDoctorEmail(payload);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Email verified successfully.",
			data: result,
		});
	},
);

const approveDoctor = catchAsync(
	async (req: Request, res: Response, next: NextFunction) => {
		const payload = req.body;
		const reviewer = req.user;

		if (!reviewer) {
			throw new Error("Reviewer information is missing.");
		}

		const result = await doctorServices.approveDoctor(payload, reviewer);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Doctor approved successfully.",
			data: result,
		});
	},
);

const getAllDoctors = catchAsync(
	async (req: Request, res: Response, next: NextFunction) => {
		const doctors = await doctorServices.getAllDoctors();

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Doctors retrieved successfully.",
			data: doctors,
		});
	},
);

// const testController = catchAsync(
// 	async (req: Request, res: Response, next: NextFunction) => {
// 		const payload = req.body;

// 		sendResponse(res, {
// 			statusCode: httpStatus.OK,
// 			success: true,
// 			message: "Registered successfully.",
// 			data: {},
// 		});
// 	},
// );

export const doctorControllers = {
	applyForDoctor,
	verifyDoctorEmail,
	approveDoctor,
	getAllDoctors,
};
