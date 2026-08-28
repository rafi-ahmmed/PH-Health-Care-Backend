import config from "../../config";
import { bkashIdToken } from "../../lib/bkash";

const bookAppointment = async () => {
	const idToken = await bkashIdToken();

	// console.log(idToken);

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
				// agreementID: "TokenizedMerchant01L3IKB6H1565072174986", // appointment id
				mode: "0011", //! Must be [0011]
				payerReference: "01723888888", // user email or phone number
				callbackURL: `${config.bkash_callback_url}/appointment/book-appointment/payment/callback`,
				// merchantAssociationInfo: "MI05MID54RF09123456One",
				amount: "12",
				currency: "BDT",
				intent: "sale",
				merchantInvoiceNumber: "Inv0126", //Appointment id
			}),
		},
	);

	const result = await bkashCreatePaymentResponse.json();
	// console.log(result);
	return result;
};

const bookAppointmentCallback = async (query: Record<string, any>) => {
	const paymentId = query.paymentID;
	const paymentStatus = query.status;

	if (!paymentId) {
		throw new Error("Payment id missing");
	}
	if (!paymentStatus) {
		throw new Error("Payment status missing");
	}

	const idToken = await bkashIdToken();

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
	console.log(paymentStatus);

	if (paymentStatus === "success") {
		return {
			paymentResult,
			redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=success`,
		};
	}
	if (paymentStatus === "failure") {
		return {
			paymentResult,
			redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=failure`,
		};
	}
	if (paymentStatus === "cancel") {
		return {
			paymentResult,
			redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=cancel`,
		};
	}

	return {
		paymentResult,
		redirectUrl: `${config.frontend_url}/dashboard/my-appointments`,
	};
};
// const bookAppointmentCallback = async () => {};

export const appointmentServices = { bookAppointment, bookAppointmentCallback };
