import type { ReactNode } from "react";
import type { useBooking } from "../../src/features/appointments/use-booking";
import type { useAvailability } from "../../src/features/availability/use-availability";
import type { useStaff } from "../../src/features/staff/use-staff";
import type {
  Appointment,
  AppointmentInput,
  DayResult,
  DraftWindow,
  Override,
  Schedule,
  ScheduleMutation,
  SelectedSlot,
  Staff,
  Window,
} from "./types";

/** Inputs for AppLayout. */
export type AppLayoutProps = { children: ReactNode };

/** Inputs for AppointmentAgenda. */
export type AppointmentAgendaProps = {
  staff: Staff;
  appointments: Appointment[];
  saving: boolean;
  cancel: (id: string) => Promise<void>;
};

/** Inputs for BookingForm. */
export type BookingFormProps = {
  staff: Staff;
  booking: ReturnType<typeof useBooking>;
  saving: boolean;
};

/** Inputs for AvailabilityDay. */
export type AvailabilityDayProps = {
  day: DayResult;
  selected: SelectedSlot | null;
  saving: boolean;
  onSelect: (slot: SelectedSlot) => void;
};

/** Inputs for AvailabilityPanel. */
export type AvailabilityPanelProps = {
  canBook: boolean;
  staff: Staff;
  saving: boolean;
  availability: ReturnType<typeof useAvailability>;
  book: (input: AppointmentInput) => Promise<void>;
};

/** Inputs for AvailabilityResults. */
export type AvailabilityResultsProps = {
  results: DayResult[] | null;
  selected: SelectedSlot | null;
  saving: boolean;
  searching: boolean;
  resultNote: string;
  onSelect: (slot: SelectedSlot) => void;
};

/** Inputs for AvailabilitySearchForm. */
export type AvailabilitySearchFormProps = {
  availability: ReturnType<typeof useAvailability>;
  saving: boolean;
};

/** Inputs for OverrideEditor. */
export type OverrideEditorProps = {
  overrides: Override[];
  mutate: ScheduleMutation;
};

/** Inputs for OverrideList. */
export type OverrideListProps = {
  overrides: Override[];
  onEdit: (override: Override) => void;
  onRemove: (override: Override) => Promise<void>;
};

/** Inputs for OverridesPanel. */
export type OverridesPanelProps = {
  schedule: Schedule;
  disabled: boolean;
  mutate: ScheduleMutation;
};

/** Inputs for StaffWorkspace. */
export type StaffWorkspaceProps = {
  canEdit: boolean;
  staff: Staff;
  creatingStaff: boolean;
  onSavingChange: (saving: boolean) => void;
};

/** Inputs for WeeklyDay. */
export type WeeklyDayProps = {
  day: number;
  windows: Window[];
  save: (day: number, windows: Window[]) => Promise<void>;
};

/** Inputs for WeeklyHoursPanel. */
export type WeeklyHoursPanelProps = {
  staff: Staff;
  schedule: Schedule;
  disabled: boolean;
  mutate: ScheduleMutation;
};

/** Inputs for StaffPicker. */
export type StaffPickerProps = {
  canCreate: boolean;
  staffState: ReturnType<typeof useStaff>;
  savingSchedule: boolean;
};

/** Inputs for WindowInputs. */
export type WindowInputsProps = {
  value: DraftWindow[];
  onChange: (value: DraftWindow[]) => void;
  label: string;
};
