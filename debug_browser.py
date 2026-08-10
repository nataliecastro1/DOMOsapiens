import sys
from selenium import webdriver
from selenium.webdriver.chrome.options import Options

chrome_options = Options()
chrome_options.add_argument("--headless")
chrome_options.set_capability("goog:loggingPrefs", {"browser": "ALL"})

try:
    driver = webdriver.Chrome(options=chrome_options)
    driver.get("http://localhost:3600")
    
    logs = driver.get_log("browser")
    for log in logs:
        print(f"[{log['level']}] {log['message']}")
        
    print("Page title:", driver.title)
    driver.quit()
except Exception as e:
    print("Error:", e)
