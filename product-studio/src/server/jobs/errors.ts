/** Errors thrown by job handlers whose message is safe to show to the user. */
export class JobError extends Error {
  expose = true;
}
