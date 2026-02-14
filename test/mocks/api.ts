/**
 * Mock API for Testing
 *
 * Provides mock fetch and API responses for testing API interactions
 * without actual network calls.
 */

/**
 * Mock API response data
 */
export interface MockApiResponse {
	status?: number;
	ok?: boolean;
	data?: any;
	error?: Error;
	delay?: number;
}

/**
 * Mock fetch function that returns predefined responses
 */
export class MockApi {
	private responses: Map<string, MockApiResponse> = new Map();
	public calls: Array<{ url: string; timestamp: Date }> = [];

	/**
	 * Set mock response for a URL pattern
	 */
	setResponse(urlPattern: string, response: MockApiResponse): void {
		this.responses.set(urlPattern, response);
	}

	/**
	 * Create mock fetch function
	 */
	get fetch() {
		return async (url: string): Promise<Response> => {
			this.calls.push({ url, timestamp: new Date() });

			// Find matching response
			let matchedResponse: MockApiResponse | undefined;
			for (const [pattern, response] of this.responses) {
				if (url.includes(pattern)) {
					matchedResponse = response;
					break;
				}
			}

			// Default response if no match
			if (!matchedResponse) {
				matchedResponse = {
					status: 404,
					ok: false,
					data: { error: 'Not found' },
				};
			}

			// Simulate network delay
			if (matchedResponse.delay) {
				await new Promise((resolve) => setTimeout(resolve, matchedResponse.delay));
			}

			// Throw error if configured
			if (matchedResponse.error) {
				throw matchedResponse.error;
			}

			// Return mock response
			const status = matchedResponse.status ?? 200;
			const ok = matchedResponse.ok ?? (status >= 200 && status < 300);

			return {
				status,
				ok,
				json: async () => matchedResponse!.data,
				text: async () => JSON.stringify(matchedResponse!.data),
			} as Response;
		};
	}

	/**
	 * Check if URL was called
	 */
	wasCalled(urlPattern: string): boolean {
		return this.calls.some((call) => call.url.includes(urlPattern));
	}

	/**
	 * Get number of times URL was called
	 */
	getCallCount(urlPattern: string): number {
		return this.calls.filter((call) => call.url.includes(urlPattern)).length;
	}

	/**
	 * Reset call history
	 */
	reset(): void {
		this.calls = [];
	}
}

/**
 * Create mock API with common SCRAP API responses
 */
export function createMockScrapApi(baseUrl: string = 'http://localhost:3000'): MockApi {
	const api = new MockApi();

	// Mock droplets endpoint
	api.setResponse(`${baseUrl}/get/droplets`, {
		status: 200,
		ok: true,
		data: {
			droplets: [
				{
					droplet_id: '1',
					owner: 'testaccount',
					bound: true,
					revealed: false,
					generation: 1,
				},
				{
					droplet_id: '2',
					owner: 'testaccount',
					bound: true,
					revealed: false,
					generation: 1,
				},
			],
		},
	});

	// Mock claimable endpoint
	api.setResponse(`${baseUrl}/get/claimable`, {
		status: 200,
		ok: true,
		data: {
			claimable: 100,
		},
	});

	return api;
}
