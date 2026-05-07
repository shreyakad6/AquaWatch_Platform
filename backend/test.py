import sys
import traceback
try:
    import main
    print("SUCCESS")
except Exception as e:
    print("FAIL")
    traceback.print_exc(file=sys.stdout)
