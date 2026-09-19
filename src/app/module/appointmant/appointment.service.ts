import {
	AppointmentStatus,
	PaymentStatus,
} from "../../../generated/prisma/enums";
import config from "../../config";
import getBkashIdToken from "../../lib/bkash";
import { prisma } from "../../lib/prisma";
import type { RequestUser } from "../../middleware/checkAuth";

//? if any payment is failed or cancelled then we can use this function to pay for the appointment again
const payForAppointment = async (payload: any, user: RequestUser) => {
	const { appointmentId } = payload;

	// console.log(appointmentId);
	// return;
	const existAppointment = await prisma.appointment.findUnique({
		where: {
			id: appointmentId,
		},
	});

	if (!existAppointment) {
		throw new Error("Appointment doesn't exist!");
	}

	const appointmentStatus = existAppointment.status;
	if (existAppointment.status !== AppointmentStatus.PENDING) {
		throw new Error(
			`This appointment is already ${appointmentStatus}`.toLocaleLowerCase(),
		);
	}

	// * Create payment
	const idToken = await getBkashIdToken();
	if (!idToken) {
		throw new Error("Bkash id token not found");
	}
	const bkashCreatePaymentResponse = await fetch(
		`${config.bkash_sandbox_url}/tokenized/checkout/create`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
				authorization: idToken,
				"X-App-Key": config.bkash_sandbox_app_key,
			},
			body: JSON.stringify({
				agreementID: existAppointment.id, // appointment id
				mode: "0011", //! Must be [0011]
				// payerReference: "01723888888", // user email or phone number
				payerReference: user.email, // user email or phone number
				callbackURL: `${config.bkash_callback_url}/appointment/book-appointment/payment/callback`,
				// merchantAssociationInfo: "MI05MID54RF09123456One",
				amount: "12",
				currency: "BDT",
				intent: "sale",
				// merchantInvoiceNumber: "Inv0126", //Appointment id
				merchantInvoiceNumber: existAppointment.id,
			}),
		},
	);
	const bkashPaymentResult = await bkashCreatePaymentResponse.json();

	//*  Update payment
	const payment = await prisma.payment.update({
		where: {
			appointmentId,
		},
		data: {
			merchantInvoiceNumber: bkashPaymentResult.merchantInvoiceNumber,
			gatewayResponse: bkashPaymentResult,
			bkashPaymentId: bkashPaymentResult.paymentID,
		},
	});

	return { paymentUrl: bkashPaymentResult.bkashURL };
};

const bookAppointment = async (payload: any, user: RequestUser) => {
	const transactionResult = await prisma.$transaction(async (tx) => {
		//* PART: 1 - Create Appointment
		const appointment = await tx.appointment.create({
			data: {
				status: AppointmentStatus.PENDING,
			},
		});

		//* PART: 2 - Create payment
		const idToken = await getBkashIdToken();
		console.log(idToken);
		if (!idToken) {
			throw new Error("Bkash id token not found");
		}
		const bkashCreatePaymentResponse = await fetch(
			`${config.bkash_sandbox_url}/tokenized/checkout/create`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json",
					authorization: idToken,
					"X-App-Key": config.bkash_sandbox_app_key,
				},
				body: JSON.stringify({
					agreementID: appointment.id, // appointment id
					mode: "0011", //! Must be [0011]
					// payerReference: "01723888888", // user email or phone number
					payerReference: user.email, // user email or phone number
					callbackURL: `${config.bkash_callback_url}/appointment/book-appointment/payment/callback`,
					// merchantAssociationInfo: "MI05MID54RF09123456One",
					amount: "1200",
					currency: "BDT",
					intent: "sale",
					// merchantInvoiceNumber: "Inv0126", //Appointment id
					merchantInvoiceNumber: appointment.id,
				}),
			},
		);
		const bkashPaymentResult = await bkashCreatePaymentResponse.json();

		//* PART: 3 - Create payment model
		const payment = await tx.payment.create({
			data: {
				merchantInvoiceNumber: bkashPaymentResult.merchantInvoiceNumber,
				appointmentId: appointment.id,
				amount: 1200,
				gatewayResponse: bkashPaymentResult,
				bkashPaymentId: bkashPaymentResult.paymentID,
				payerReference: user.email,
			},
		});

		return { paymentUrl: bkashPaymentResult.bkashURL };
	});

	return transactionResult;
};

const bookAppointmentCallback = async (query: Record<string, any>) => {
	const transactionResult = await prisma.$transaction(async (tx) => {
		const paymentId = query.paymentID;
		const paymentStatus = query.status;

		if (!paymentId) {
			throw new Error("Payment id missing");
		}
		if (!paymentStatus) {
			throw new Error("Payment status missing");
		}

		const idToken = await getBkashIdToken();

		if (!idToken) {
			throw new Error("Bkash id token not found");
		}

		const executePayment = await fetch(
			`${config.bkash_sandbox_url}/tokenized/checkout/execute`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json",
					authorization: idToken,
					"X-App-Key": config.bkash_sandbox_app_key,
				},
				body: JSON.stringify({
					paymentID: paymentId,
				}),
			},
		);

		const paymentResult = await executePayment.json();
		console.log("From Callback", paymentResult);

		if (paymentStatus === "success") {
			// * Update appointment status
			await tx.appointment.update({
				where: {
					id: paymentResult.merchantInvoiceNumber,
				},
				data: {
					status: AppointmentStatus.CONFIRMED,
				},
			});

			// * Update payment model
			await tx.payment.update({
				where: {
					appointmentId: paymentResult.merchantInvoiceNumber,
					bkashPaymentId: paymentId,
				},
				data: {
					bkashTrxId: paymentResult.trxID,
					gatewayResponse: paymentResult,
					paidAt: paymentResult.paymentExecuteTime,
					status: PaymentStatus.PAID,
				},
			});

			return {
				paymentResult,
				redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=success`,
			};
		} else if (paymentStatus === "failure") {
			// * Update payment status
			await tx.payment.update({
				where: {
					bkashPaymentId: paymentId,
				},
				data: {
					bkashTrxId: paymentResult.trxID,
					gatewayResponse: paymentResult,

					status: PaymentStatus.FAILED,
				},
			});

			return {
				paymentResult,
				redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=failure`,
			};
		} else if (paymentStatus === "cancel") {
			// * Update payment status
			await tx.payment.update({
				where: {
					bkashPaymentId: paymentId,
				},
				data: {
					bkashTrxId: paymentResult.trxID,
					gatewayResponse: paymentResult,
					status: PaymentStatus.CANCELLED,
				},
			});

			return {
				paymentResult,
				redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=cancel`,
			};
		} else {
			return {
				success: true,
				paymentResult,
				redirectUrl: `${config.frontend_url}/dashboard/my-appointments?error=Payment-Failed`,
			};
		}
	});

	return transactionResult;
};

const cancelAppointment = async (payload: any) => {
	const transactionResult = await prisma.$transaction(async (tx) => {
		const appointmentId = payload.appointmentId;

		const appointment = await tx.appointment.findUnique({
			where: {
				id: appointmentId,
			},
			include: {
				payment: true,
			},
		});
		const appointmentStatus = appointment?.status;

		if (!appointment) {
			throw new Error("Appointment not found");
		}

		if (
			appointmentStatus === AppointmentStatus.ONGOING ||
			appointmentStatus === AppointmentStatus.COMPLETED
		) {
			throw new Error(
				"You can't cancel this appointment because it is already " +
					appointmentStatus.toLowerCase(),
			);
		}
		if (appointmentStatus === AppointmentStatus.CANCELED) {
			throw new Error("This appointment is already canceled");
		}

		// * Update appointment status to canceled
		const updateAppointment = await tx.appointment.update({
			where: {
				id: appointmentId,
			},
			data: {
				status: AppointmentStatus.CANCELED,
			},
		});

		// *Now refund the payment if it is already paid
		const idToken = await getBkashIdToken();
		const amount = appointment.payment?.amount.toString();
		console.log(amount);
		if (!idToken) {
			throw new Error("Bkash id token not found");
		}
		const refundPaymentResponse = await fetch(
			`${config.bkash_sandbox_url}/tokenized/checkout/payment/refund`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json",
					authorization: idToken,
					"X-App-Key": config.bkash_sandbox_app_key,
				},
				body: JSON.stringify({
					paymentID: appointment.payment?.bkashPaymentId, // paymentID
					trxID: appointment.payment?.bkashTrxId, // trxID
					amount: amount, // amount
					sku: appointment.id,
					reason: "Patient cancelled the appointment",
				}),
			},
		);
		const refundPaymentResult = await refundPaymentResponse.json();
		console.log("Refund Result ===", refundPaymentResult);

		// * Update Payment

		const updatedPayment = await tx.payment.update({
			where: {
				appointmentId: appointmentId,
			},
			data: {
				status: PaymentStatus.REFUNDED,
				refundAmount: refundPaymentResult.amount,
				refundAt: refundPaymentResult.completedTime,
				refundTrxId: refundPaymentResult.refundTrxID,
				refundReason: "Patient cancelled the appointment",
				gatewayResponse: refundPaymentResult,
			},
		});

		return {
			appointment,
			payment: updatedPayment,
			refundPaymentResult,
		};
	});

	return transactionResult;
};

// const bookAppointmentCallback = async () => {};

export const appointmentServices = {
	payForAppointment,
	bookAppointment,
	cancelAppointment,
	bookAppointmentCallback,
};
