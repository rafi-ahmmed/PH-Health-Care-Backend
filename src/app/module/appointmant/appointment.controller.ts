import type { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { appointmentServices } from "./appointment.service";

const bookAppointment = catchAsync(
	async (req: Request, res: Response, next: NextFunction) => {
		const payload = req.body;
		const user = req.user!;

		const result = await appointmentServices.bookAppointment(payload, user);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Appointment booked successfully.",
			data: result,
		});
	},
);

const bookAppointmentCallback = catchAsync(
	async (req: Request, res: Response, next: NextFunction) => {
		const { paymentResult, redirectUrl } =
			await appointmentServices.bookAppointmentCallback(req.query);

		res.redirect(redirectUrl);
	},
);

const payForAppointment = catchAsync(
	async (req: Request, res: Response, next: NextFunction) => {
		const payload = req.body;
		const user = req.user!;

		const result = await appointmentServices.payForAppointment(payload, user);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Payment URL created",
			data: result,
		});
	},
);

const cancelAppointment = catchAsync(
	async (req: Request, res: Response, next: NextFunction) => {
		const payload = req.body;

		const result = await appointmentServices.cancelAppointment(payload);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Appointment cancelled successfully.",
			data: result,
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

export const appointmentControllers = {
	bookAppointment,
	bookAppointmentCallback,
	payForAppointment,
	cancelAppointment
};
