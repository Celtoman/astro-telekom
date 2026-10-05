// Upgrade cleanup only: no timed publication is registered or executed.
export async function retirePublicationScheduler(queue) {
  await queue.removeJobScheduler('publication-schedules-every-minute');
}

export function isRetiredPublicationJob(job) {
  return job.name === 'publication-schedules';
}
