import { useState, useEffect, useCallback } from "react";
import {
  getMeetings,
  getMeetingWithDetails,
  deleteMeeting,
  updateMeetingTitle,
} from "../services/meetings";
import type { Meeting, MeetingWithDetails } from "../services/meetings";

export function useMeetings() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const data = await getMeetings();
    setMeetings(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const remove = useCallback(
    async (id: string) => {
      await deleteMeeting(id);
      await refresh();
    },
    [refresh],
  );

  const rename = useCallback(
    async (id: string, title: string) => {
      await updateMeetingTitle(id, title);
      await refresh();
    },
    [refresh],
  );

  return { meetings, loading, refresh, remove, rename };
}

export function useMeetingDetail(meetingId: string | undefined) {
  const [details, setDetails] = useState<MeetingWithDetails | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!meetingId) {
      setDetails(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const data = await getMeetingWithDetails(meetingId);
    setDetails(data);
    setLoading(false);
  }, [meetingId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { details, loading, refresh };
}
