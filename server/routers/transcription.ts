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
      // TODO: Integrate real transcription provider (AssemblyAI / Whisper).
      const source = input.audioUrl ? "url" : input.audioBase64 ? "base64" : "none";
      return {
        text: "",
        language: input.language ?? "en",
        confidence: 0,
        source,
        status: "pending_integration" as const,
      };
    }),
});
