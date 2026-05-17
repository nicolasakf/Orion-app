def hello_world():
    print("Hello, World!")

def hello_orion():
    print("Hello, Orion!")

def concat_strings(s1, s2, separator=" "):
    """Concatenates two strings with an optional separator."""
    return f"{s1}{separator}{s2}"

if __name__ == "__main__":
    hello_world()
    hello_orion()
    print(concat_strings("Hello", "World"))
