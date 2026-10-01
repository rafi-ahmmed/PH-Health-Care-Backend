import type { DoctorVerificationStatus } from "../../../generated/prisma/enums";

export interface IVerifyDoctorEmail {
	email: string;
	otp: string;
}

export interface IApplyForDoctor {
	user: {
		name: string;
		email: string;
		password: string;
	};
	doctor: {
		address?: string;
		specialization: string;
		licenseNumber: string;
		qualifications: string;
		experienceYears: number;
		bio?: string;
		consultationFee?: number;
		contactNumber?: string;
	};
}

export interface IApproveDoctor {
	doctorId: string;
	verificationStatus: DoctorVerificationStatus;
	rejectionReason?: string;
}
