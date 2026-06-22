/**
 * Lazily wires the CRA-style web-vitals callback when a listener is supplied.
 */
const reportWebVitals = onPerfEntry => {
	if(onPerfEntry && onPerfEntry instanceof Function)
	{
		import('web-vitals').then(({ getCLS, getFID, getFCP, getLCP, getTTFB }) => {
      getCLS(onPerfEntry);
      getFID(onPerfEntry);
      getFCP(onPerfEntry);
      getLCP(onPerfEntry);
      getTTFB(onPerfEntry);
		});
	}
};

export default reportWebVitals;
