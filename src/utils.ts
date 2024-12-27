export const removeNestedProperty = (obj: any, propToRemove: string) => {
  if (obj instanceof Array) {
    obj.forEach((item) => removeNestedProperty(item, propToRemove));
  } else if (obj instanceof Object) {
    for (let prop in obj) {
      if (prop === propToRemove) {
        delete obj[prop]; // Remove the property
      } else if (obj[prop] instanceof Object || obj[prop] instanceof Array) {
        removeNestedProperty(obj[prop], propToRemove); // Recursive call
      }
    }
  }
};

export const fetchRetry = async (url: string, options: RequestInit, maxRetries = 1, retryOn = [504]) => {
  let response: Response | undefined = undefined;
  for (let i = 0; i <= maxRetries; i++) {
    const currentResponse = await fetch(url, options);

    if (retryOn.includes(currentResponse.status) && i < maxRetries) {
      console.log(`Retrying due to ${currentResponse.status} error: ${url}`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    } else {
      response = currentResponse;
      break;
    }
  }

  if (response === undefined) {
    throw new Error('Response was not initialized.'); // Or handle this case as you see fit
  }

  return response;
};
