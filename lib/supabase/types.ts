// Shared domain types used across pages, components and API routes.

export type Role = "admin" | "hod" | "faculty";

export type ProfileStatus = "invited" | "active" | "disabled";

export type RequestStatus = "pending" | "approved" | "rejected";

export type InviteStatus = "pending" | "accepted" | "revoked";

export type ReportStatus =
  | "not_started"
  | "in_progress"
  | "under_review"
  | "approved"
  | "rejected";

export interface Department {
  id: string;
  name: string;
}

export interface Profile {
  id: string;
  full_name: string | null;
  email: string;
  role: Role;
  status: ProfileStatus;
  department_id?: string | null;
  department?: Department | null;
}

export interface LoginSession {
  user_id: string;
  login_at: string;
  logout_at: string | null;
}

export interface AccessRequest {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  department_id: string;
  requested_to: string | null;
  status: RequestStatus;
  created_at: string;
  responded_at?: string | null;
  responded_by?: string | null;
  department?: Department | null;
}

export interface Invite {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  department_id: string;
  invited_by: string;
  status: InviteStatus;
  created_at: string;
  department?: Department | null;
}

export interface Report {
  id: string;
  department_id: string;
  status: ReportStatus;
  updated_at: string;
  reviewed_at?: string | null;
  department?: Department | null;
}

export interface FileRow {
  id: string;
  report_id: string;
  department_id: string;
  uploaded_by: string;
  file_name: string;
  file_type: string;
  storage_path: string;
  file_size_bytes?: number;
  uploaded_at: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
  uploader?: { full_name: string | null } | null;
}
