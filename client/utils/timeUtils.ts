/**
 * Format seconds into MM:SS format
 * @param seconds - Number of seconds to format
 * @returns Formatted time string in MM:SS format
 */
export const formatTime = (seconds: number): string => {
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;

	const formattedMinutes = minutes.toString().padStart(2, '0');
	const formattedSeconds = remainingSeconds.toString().padStart(2, '0');

	return `${formattedMinutes}:${formattedSeconds}`;
};
