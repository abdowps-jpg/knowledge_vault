import { z } from "zod";
import { protectedProcedure, router } from "../trpc";

export const transcriptionRouter = router({
  transcribe: protectedProcedure
    .input(
      z.object({
        audioBase64: z.string().optional(),
        audioUrl: z.string().optional(),
        language: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const source = input.audioUrl ? "url" : input.audioBase64 ? "base64" : "none";
      // Transcription provider not yet configured.
      // To enable: set OPENAI_API_KEY env var and integrate Whisper API here.
      return {
        text: null as string | null,
        language: input.language ?? "en",
        confidence: 0,
        source,
        status: "not_configured" as const,
      };
    }),
});
