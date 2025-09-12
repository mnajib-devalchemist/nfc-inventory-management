/**
 * useDebounce Hook
 * 
 * A React hook that debounces a value, delaying updates until after a specified delay.
 * Useful for search inputs and other scenarios where you want to limit API calls.
 * 
 * @category Hooks
 * @since 1.4.0
 */

import { useState, useEffect } from 'react';

/**
 * Debounce hook that delays updating a value until after a specified delay.
 * 
 * This hook is particularly useful for search inputs where you want to wait
 * for the user to stop typing before making an API call.
 * 
 * @param value - The value to debounce
 * @param delay - Delay in milliseconds before updating the debounced value
 * @returns The debounced value
 * 
 * @example Basic usage for search input
 * ```typescript
 * function SearchComponent() {
 *   const [searchText, setSearchText] = useState('');
 *   const debouncedSearchText = useDebounce(searchText, 300);
 * 
 *   useEffect(() => {
 *     if (debouncedSearchText) {
 *       // Make API call with debouncedSearchText
 *       performSearch(debouncedSearchText);
 *     }
 *   }, [debouncedSearchText]);
 * 
 *   return (
 *     <input
 *       value={searchText}
 *       onChange={(e) => setSearchText(e.target.value)}
 *       placeholder="Search..."
 *     />
 *   );
 * }
 * ```
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Set up the timeout
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Clean up the timeout if value changes before delay completes
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Advanced debounce hook with additional options.
 * 
 * Provides more control over the debouncing behavior including
 * leading edge execution and maximum wait time.
 * 
 * @param value - The value to debounce
 * @param delay - Delay in milliseconds
 * @param options - Additional debounce options
 * @returns The debounced value
 */
export function useAdvancedDebounce<T>(
  value: T,
  delay: number,
  options: {
    /** Execute on the leading edge of the timeout */
    leading?: boolean;
    /** Maximum time to wait before executing */
    maxWait?: number;
  } = {}
): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  const [isFirstExecution, setIsFirstExecution] = useState(true);

  useEffect(() => {
    let handler: NodeJS.Timeout;
    let maxWaitHandler: NodeJS.Timeout | undefined;

    // Leading edge execution
    if (options.leading && isFirstExecution) {
      setDebouncedValue(value);
      setIsFirstExecution(false);
      return;
    }

    // Set up the main debounce timeout
    handler = setTimeout(() => {
      setDebouncedValue(value);
      if (maxWaitHandler) {
        clearTimeout(maxWaitHandler);
      }
    }, delay);

    // Set up max wait timeout if specified
    if (options.maxWait && options.maxWait > delay) {
      maxWaitHandler = setTimeout(() => {
        setDebouncedValue(value);
        clearTimeout(handler);
      }, options.maxWait);
    }

    // Cleanup function
    return () => {
      clearTimeout(handler);
      if (maxWaitHandler) {
        clearTimeout(maxWaitHandler);
      }
    };
  }, [value, delay, options.leading, options.maxWait, isFirstExecution]);

  return debouncedValue;
}

/**
 * Debounce hook for callback functions.
 * 
 * Debounces a callback function call, useful when you want to debounce
 * function execution rather than value updates.
 * 
 * @param callback - The callback function to debounce
 * @param delay - Delay in milliseconds
 * @param deps - Dependency array for the callback
 * @returns The debounced callback function
 * 
 * @example Debouncing a search function
 * ```typescript
 * function SearchComponent() {
 *   const [searchText, setSearchText] = useState('');
 * 
 *   const debouncedSearch = useDebounceCallback(
 *     async (query: string) => {
 *       if (query.trim()) {
 *         const results = await searchAPI(query);
 *         setSearchResults(results);
 *       }
 *     },
 *     300,
 *     []
 *   );
 * 
 *   const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
 *     const value = e.target.value;
 *     setSearchText(value);
 *     debouncedSearch(value);
 *   };
 * 
 *   return <input onChange={handleInputChange} />;
 * }
 * ```
 */
export function useDebounceCallback<Args extends any[], Return>(
  callback: (...args: Args) => Return,
  delay: number,
  deps: React.DependencyList
): (...args: Args) => void {
  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null);

  // Clean up timeout on unmount or dependency change
  useEffect(() => {
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, deps);

  const debouncedCallback = (...args: Args) => {
    // Clear existing timeout
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    // Set new timeout
    const newTimeoutId = setTimeout(() => {
      callback(...args);
      setTimeoutId(null);
    }, delay);

    setTimeoutId(newTimeoutId);
  };

  return debouncedCallback;
}

export default useDebounce;